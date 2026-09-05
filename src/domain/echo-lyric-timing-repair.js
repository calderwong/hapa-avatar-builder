function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value) {
  return Number(finite(value).toFixed(3));
}

function timingLocked(cue = {}) {
  return cue.manual_locked === true || cue.manualLock === true || cue.timing_lock?.locked === true;
}

function invalidWord(word = {}) {
  const start = Number(word.start ?? word.startSeconds ?? word.startTime);
  const end = Number(word.end ?? word.endSeconds ?? word.endTime);
  return !Number.isFinite(start) || !Number.isFinite(end) || end <= start;
}

export function repairEchoLyricWordIntervals(lines = [], {
  minimumWordDuration = 0.02,
} = {}) {
  let repairedWordIntervals = 0;
  let unrepairableWordIntervals = 0;
  const repairedLines = (Array.isArray(lines) ? lines : []).map((line) => {
    const words = Array.isArray(line?.words)
      ? line.words.map((word) => ({ ...word }))
      : [];
    if (!words.some(invalidWord)) return { ...line, words };
    if (timingLocked(line)) {
      unrepairableWordIntervals += words.filter(invalidWord).length;
      return { ...line, words };
    }
    const lineStart = finite(line?.start ?? line?.startSeconds);
    const lineEnd = finite(line?.end ?? line?.endSeconds, lineStart);
    if (lineEnd <= lineStart) {
      unrepairableWordIntervals += words.filter(invalidWord).length;
      return { ...line, words };
    }
    let cursor = 0;
    while (cursor < words.length) {
      if (!invalidWord(words[cursor])) {
        cursor += 1;
        continue;
      }
      let runStart = cursor;
      let runEnd = cursor;
      while (runEnd + 1 < words.length && invalidWord(words[runEnd + 1])) runEnd += 1;
      const nextStart = runEnd + 1 < words.length
        ? finite(words[runEnd + 1]?.start ?? words[runEnd + 1]?.startSeconds ?? words[runEnd + 1]?.startTime, lineEnd)
        : lineEnd;
      let leftBoundary = runStart > 0
        ? finite(words[runStart - 1]?.end ?? words[runStart - 1]?.endSeconds ?? words[runStart - 1]?.endTime, lineStart)
        : lineStart;
      let repairStart = runStart;
      let repairCount = runEnd - repairStart + 1;
      while (
        repairStart > 0
        && nextStart - leftBoundary < minimumWordDuration * repairCount
      ) {
        repairStart -= 1;
        leftBoundary = finite(words[repairStart]?.start ?? words[repairStart]?.startSeconds ?? words[repairStart]?.startTime, lineStart);
        repairCount = runEnd - repairStart + 1;
      }
      if (nextStart <= leftBoundary || nextStart - leftBoundary < minimumWordDuration * repairCount) {
        repairStart = 0;
        leftBoundary = lineStart;
        repairCount = runEnd + 1;
      }
      const span = nextStart - leftBoundary;
      if (span <= 0 || span < minimumWordDuration * repairCount) {
        unrepairableWordIntervals += runEnd - runStart + 1;
        cursor = runEnd + 1;
        continue;
      }
      if (words.slice(repairStart, runEnd + 1).some(timingLocked)) {
        unrepairableWordIntervals += runEnd - runStart + 1;
        cursor = runEnd + 1;
        continue;
      }
      const slice = span / repairCount;
      for (let index = repairStart; index <= runEnd; index += 1) {
        const offset = index - repairStart;
        const word = words[index];
        word.timing_repair = {
          schemaVersion: "hapa.echo.inferred-word-repair.v1",
          method: "even-distribution-inside-line-window",
          alignmentStatus: "unmeasured-needs-review",
          original: word.timing_repair?.original || {
            start: word.start ?? word.startSeconds ?? word.startTime ?? null,
            end: word.end ?? word.endSeconds ?? word.endTime ?? null,
            confidence: word.confidence ?? null,
            matched: word.matched ?? null,
            timingSource: word.timing_source ?? null,
          },
        };
        word.confidence = 0;
        word.matched = false;
        word.timing_source = "inferred-interval-repair";
        words[index].start = round(leftBoundary + (slice * offset));
        words[index].end = round(leftBoundary + (slice * (offset + 1)));
        delete words[index].startSeconds;
        delete words[index].endSeconds;
        delete words[index].startTime;
        delete words[index].endTime;
      }
      repairedWordIntervals += runEnd - runStart + 1;
      cursor = runEnd + 1;
    }
    return { ...line, words };
  });
  return {
    lines: repairedLines,
    repairedWordIntervals,
    unrepairableWordIntervals,
    changed: repairedWordIntervals > 0,
  };
}

export function trimEchoLyricTimingToDuration(lines = [], durationSeconds = 0) {
  const duration = Math.max(0, finite(durationSeconds));
  if (!duration) {
    return {
      lines: Array.isArray(lines) ? lines.map((line) => ({ ...line })) : [],
      trimmedLines: 0,
      trimmedWords: 0,
      droppedLines: 0,
      untrimmedLockedLines: 0,
      changed: false,
    };
  }
  let trimmedLines = 0;
  let trimmedWords = 0;
  let droppedLines = 0;
  let untrimmedLockedLines = 0;
  const output = [];
  for (const sourceLine of Array.isArray(lines) ? lines : []) {
    const lineStart = finite(sourceLine?.start ?? sourceLine?.startSeconds);
    const lineEnd = finite(sourceLine?.end ?? sourceLine?.endSeconds, lineStart);
    if (lineEnd <= duration + 0.25) {
      output.push({ ...sourceLine, words: (sourceLine.words || []).map((word) => ({ ...word })) });
      continue;
    }
    const sourceWords = Array.isArray(sourceLine?.words) ? sourceLine.words : [];
    if (timingLocked(sourceLine) || sourceWords.some((word) => timingLocked(word) && finite(word.end ?? word.endSeconds ?? word.endTime) > duration)) {
      untrimmedLockedLines += 1;
      output.push({ ...sourceLine, words: sourceWords.map((word) => ({ ...word })) });
      continue;
    }
    const words = sourceWords
      .filter((word) => finite(word?.start ?? word?.startSeconds ?? word?.startTime) < duration)
      .map((word) => {
        const start = finite(word?.start ?? word?.startSeconds ?? word?.startTime);
        const end = Math.min(duration, finite(word?.end ?? word?.endSeconds ?? word?.endTime, start));
        const { startSeconds, endSeconds, startTime, endTime, ...canonical } = word;
        return { ...canonical, start: round(start), end: round(end) };
      })
      .filter((word) => word.end > word.start);
    trimmedWords += sourceWords.length - words.length;
    if (!words.length || lineStart >= duration) {
      droppedLines += 1;
      continue;
    }
    trimmedLines += 1;
    const { startSeconds, endSeconds, ...canonicalLine } = sourceLine;
    output.push({
      ...canonicalLine,
      start: lineStart,
      text: words.map((word) => String(word.word || word.text || "")).filter(Boolean).join(" "),
      end: round(Math.min(duration, words.at(-1)?.end || duration)),
      words,
    });
  }
  return {
    lines: output,
    trimmedLines,
    trimmedWords,
    droppedLines,
    untrimmedLockedLines,
    changed: trimmedLines > 0 || droppedLines > 0,
  };
}

export function repairEchoLyricTimingDefects(timing = {}) {
  const intervalRepair = repairEchoLyricWordIntervals(timing.lines || []);
  const durationRepair = trimEchoLyricTimingToDuration(
    intervalRepair.lines,
    timing.duration,
  );
  const lines = durationRepair.lines;
  const words = lines.flatMap((line) => line.words || []);
  const matchedWords = words.filter((word) => word.matched === true).length;
  const stats = {
    ...(timing.stats || {}),
    lineCount: lines.length,
    wordCount: words.length,
    matchedWords,
    matchedRatio: words.length ? round(matchedWords / words.length) : 0,
  };
  return {
    timing: {
      ...timing,
      lines,
      stats,
    },
    repairedWordIntervals: intervalRepair.repairedWordIntervals,
    unrepairableWordIntervals: intervalRepair.unrepairableWordIntervals,
    trimmedLines: durationRepair.trimmedLines,
    trimmedWords: durationRepair.trimmedWords,
    droppedLines: durationRepair.droppedLines,
    untrimmedLockedLines: durationRepair.untrimmedLockedLines,
    changed: intervalRepair.changed || durationRepair.changed,
  };
}
