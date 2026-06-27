const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises");
const http = require("node:http");
const https = require("node:https");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const targetUrl = process.env.LATENCY_URL || process.env.SMOKE_URL || "http://127.0.0.1:5178/";
const apiBase = process.env.LATENCY_API_BASE || "http://127.0.0.1:8787";
const latencyTargetMs = Number(process.env.LATENCY_TARGET_MS || 500);
const keystrokeTargetMs = Number(process.env.LATENCY_KEYSTROKE_TARGET_MS || 75);
const latencyMode = (process.env.LATENCY_MODE || "fast").toLowerCase();
const routeTimeoutMs = Number(process.env.LATENCY_ROUTE_TIMEOUT_MS || (latencyMode === "deep" ? 12000 : 5000));
const shellPayloadBudgetBytes = Number(process.env.LATENCY_SHELL_PAYLOAD_BUDGET_BYTES || 1000000);
const artifactsDir = path.join(ROOT, "artifacts/perf");
const reportJsonPath = path.join(artifactsDir, "avatar-builder-latency-report.json");
const reportMarkdownPath = path.join(artifactsDir, "avatar-builder-latency-report.md");
const errors = [];

const routes = [
  { label: "Builder", tab: "Builder", selector: ".builder-view" },
  { label: "Mind", tab: "Mind", selector: ".mind-view" },
  { label: "Scenes", tab: "Scenes", selector: ".scenes-workflow-view" },
  { label: "Items", tab: "Items", selector: ".item-manager-view" },
  { label: "Loops", tab: "Loops", selector: ".loops-view" },
  { label: "Look Book", tab: "Look Book", selector: ".lookbook-view" },
  { label: "Lore Reader", tab: "Lore Reader", selector: ".lore-reader-view", deep: true },
  { label: "Hapa Songs", tab: "Hapa Songs", selector: ".hapa-songs-view", deep: true },
  { label: "Kanban", tab: "Kanban", selector: ".kanban-view" },
  { label: "Avatar Card", tab: "Avatar Card", selector: ".avatar-showcase-view" },
  { label: "Tarot Library", tab: "Tarot Library", selector: ".tarot-workspace-view", rawMediaBudget: 32 },
  { label: "Tarot Draw", tab: "Tarot Draw", selector: ".tarot-draw-view", deep: true, rawMediaBudget: 24 },
  { label: "Echos Album", tab: "Echos Album", selector: ".hapa-echos-view", deep: true, rawMediaBudget: 4 }
];

const subPages = [
  {
    label: "Scenes: select next place",
    parentTab: "Scenes",
    selector: ".scenes-workflow-view",
    action: "clickFirstNonActive('.place-row')",
    rawMediaBudget: 2
  },
  {
    label: "Scenes: select next scene",
    parentTab: "Scenes",
    selector: ".scenes-workflow-view",
    action: "clickFirstNonActive('.scene-row')",
    rawMediaBudget: 2
  },
  {
    label: "Loops: select seed",
    parentTab: "Loops",
    selector: ".loops-view",
    action: "clickFirstAvailable('.loop-seed-row')",
    rawMediaBudget: 12
  },
  {
    label: "Look Book: next page",
    parentTab: "Look Book",
    selector: ".lookbook-view",
    action: "clickTextButton('Next')",
    deep: true
  },
  {
    label: "Tarot Library: select card",
    parentTab: "Tarot Library",
    selector: ".tarot-workspace-view",
    action: "clickFirstNonActive('.tarot-card-tile')"
  },
  {
    label: "Avatar Card: open related avatar profile",
    parentTab: "Avatar Card",
    selector: ".avatar-showcase-view",
    action: "clickFirstAvailable('.showcase-avatar-link, .profile-trail-card, .tarot-inspector-contact')",
    deep: true
  }
];

const typingProbes = [
  {
    label: "Builder intake search",
    parentTab: "Builder",
    routeSelector: ".builder-view",
    selector: ".intake-panel .search-box input",
    text: " live"
  },
  {
    label: "Mind persona identity",
    parentTab: "Mind",
    routeSelector: ".mind-view",
    selector: ".mind-persona textarea",
    text: " live"
  },
  {
    label: "Scenes narrative text",
    parentTab: "Scenes",
    routeSelector: ".scenes-workflow-view",
    selector: ".scene-editor-panel textarea",
    text: " live"
  },
  {
    label: "Tarot library editor",
    parentTab: "Tarot Library",
    routeSelector: ".tarot-workspace-view",
    action: "clickFirstAvailable('.tarot-card-tile')",
    selector: ".tarot-card-form textarea, .tarot-card-form input, .tarot-deck-editor input, .tarot-deck-editor textarea, .tarot-set-editor input, .tarot-set-editor textarea",
    text: " live"
  },
  {
    label: "Echos director rationale",
    parentTab: "Echos Album",
    routeSelector: ".hapa-echos-view",
    selector: ".hapa-echos-view textarea",
    text: " live",
    actionSettleMs: 1500,
    deep: true
  }
];

function shouldRun(item) {
  if (latencyMode === "all" || latencyMode === "deep") return true;
  return !item.deep;
}

function nowIso() {
  return new Date().toISOString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fetchHead(url) {
  const started = Date.now();
  return new Promise((resolve) => {
    const client = url.startsWith("https:") ? https : http;
    const request = client.get(url, (response) => {
      let bytes = 0;
      response.on("data", (chunk) => {
        bytes += chunk.length;
      });
      response.on("end", () => {
        resolve({
          url,
          ok: response.statusCode >= 200 && response.statusCode < 400,
          statusCode: response.statusCode,
          latencyMs: Date.now() - started,
          bytes
        });
      });
    });
    request.on("error", (error) => {
      resolve({
        url,
        ok: false,
        statusCode: 0,
        latencyMs: Date.now() - started,
        bytes: 0,
        error: error instanceof Error ? error.message : String(error)
      });
    });
  });
}

function fetchJson(url) {
  const started = Date.now();
  return new Promise((resolve) => {
    const client = url.startsWith("https:") ? https : http;
    const request = client.get(url, (response) => {
      const chunks = [];
      let bytes = 0;
      response.on("data", (chunk) => {
        chunks.push(chunk);
        bytes += chunk.length;
      });
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        try {
          resolve({
            ok: response.statusCode >= 200 && response.statusCode < 400,
            statusCode: response.statusCode,
            latencyMs: Date.now() - started,
            bytes,
            json: JSON.parse(text)
          });
        } catch (error) {
          resolve({
            ok: false,
            statusCode: response.statusCode,
            latencyMs: Date.now() - started,
            bytes,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      });
    });
    request.on("error", (error) => {
      resolve({
        ok: false,
        statusCode: 0,
        latencyMs: Date.now() - started,
        bytes: 0,
        error: error instanceof Error ? error.message : String(error)
      });
    });
  });
}

function jsString(value) {
  return JSON.stringify(value);
}

async function evaluate(win, source) {
  return win.webContents.executeJavaScript(source);
}

async function waitFor(win, expression, timeoutMs = 10000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const ready = await evaluate(win, expression);
    if (ready) return true;
    await sleep(50);
  }
  return false;
}

async function waitForAppShell(win) {
  const started = Date.now();
  await waitFor(win, "Boolean(document.querySelector('.view-tabs button') && document.querySelector('.app-shell'))", 20000);
  const shellMs = Date.now() - started;
  const bootstrapState = await evaluate(win, `
    (() => ({
      title: document.querySelector('h1')?.textContent || '',
      activeTab: [...document.querySelectorAll('.view-tabs button')].find((button) => button.getAttribute('aria-selected') === 'true')?.textContent?.trim() || '',
      boardText: [...document.querySelectorAll('.status-chip')].map((chip) => chip.innerText).find((text) => /BOARD/i.test(text)) || '',
      bodyPreview: document.body.innerText.slice(0, 400)
    }))()
  `);
  return { shellMs, bootstrapState };
}

async function installRuntimeObserver(win) {
  return evaluate(win, `
    (() => {
      window.__HAPA_LATENCY_LONG_TASKS__ = [];
      if ('PerformanceObserver' in window) {
        try {
          window.__HAPA_LATENCY_LONG_TASK_OBSERVER__?.disconnect?.();
          window.__HAPA_LATENCY_LONG_TASK_OBSERVER__ = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              window.__HAPA_LATENCY_LONG_TASKS__.push({
                name: entry.name,
                startTime: Math.round(entry.startTime),
                duration: Math.round(entry.duration)
              });
            }
          });
          window.__HAPA_LATENCY_LONG_TASK_OBSERVER__.observe({ type: 'longtask', buffered: true });
        } catch {}
      }
      return true;
    })()
  `);
}

function runtimeSnapshotSource(extra = "") {
  return `
    (() => {
      const longTasks = window.__HAPA_LATENCY_LONG_TASKS__ || [];
      const memory = performance.memory ? {
        usedJSHeapSize: performance.memory.usedJSHeapSize || 0,
        totalJSHeapSize: performance.memory.totalJSHeapSize || 0,
        jsHeapSizeLimit: performance.memory.jsHeapSizeLimit || 0
      } : null;
      return {
        ${extra}
        longTaskCountTotal: longTasks.length,
        maxLongTaskMsTotal: longTasks.reduce((max, item) => Math.max(max, item.duration || 0), 0),
        domNodes: document.querySelectorAll('*').length,
        imageElements: document.images.length,
        videoElements: document.querySelectorAll('video').length,
        canvasElements: document.querySelectorAll('canvas').length,
        queueInspector: window.__HAPA_QUEUE_INSPECTOR__?.summary || null,
        memory
      };
    })()
  `;
}

async function clickRoute(win, route) {
  return evaluate(win, `
    (async () => {
      const targetMs = ${latencyTargetMs};
      const rawMediaBudget = ${Number.isFinite(route.rawMediaBudget) ? route.rawMediaBudget : 0};
      const label = ${jsString(route.tab)};
      const selector = ${jsString(route.selector)};
      const started = performance.now();
      const beforeResources = performance.getEntriesByType('resource').length;
      const beforeLongTasks = (window.__HAPA_LATENCY_LONG_TASKS__ || []).length;
      const button = [...document.querySelectorAll('.view-tabs button')]
        .find((item) => (item.textContent || '').trim().toLowerCase() === label.toLowerCase());
      if (!button) {
        return { label, ok: false, reason: 'missing-tab', latencyMs: null, settledMs: null, targetMs };
      }
      button.click();
      let contentMs = null;
      let settledMs = null;
      while (performance.now() - started < ${routeTimeoutMs}) {
        const active = button.getAttribute('aria-selected') === 'true';
        const contentReady = Boolean(document.querySelector(selector));
        if (active && contentReady && contentMs === null) {
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          contentMs = performance.now() - started;
        }
        if (active && contentReady && !document.querySelector('.route-pending')) {
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          settledMs = performance.now() - started;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 16));
      }
      const resources = performance.getEntriesByType('resource').slice(beforeResources);
      const rawMediaRequests = resources.filter((entry) => /\\.(png|jpe?g|webp|gif|mp4|mov|webm|glb|gltf)(\\?|$)/i.test(entry.name || '')).length;
      const bytes = resources.reduce((sum, entry) => sum + (entry.transferSize || entry.encodedBodySize || 0), 0);
      const longTasks = (window.__HAPA_LATENCY_LONG_TASKS__ || []).slice(beforeLongTasks);
      const runtime = (${runtimeSnapshotSource("")});
      return {
        label,
        ok: settledMs !== null && settledMs <= targetMs && rawMediaRequests <= rawMediaBudget,
        contentMs: contentMs === null ? null : Math.round(contentMs),
        settledMs: settledMs === null ? null : Math.round(settledMs),
        targetMs,
        reason: settledMs === null ? 'route-timeout' : settledMs > targetMs ? 'target-missed' : rawMediaRequests > rawMediaBudget ? 'raw-media-budget-missed' : 'target-met',
        resourceCount: resources.length,
        rawMediaRequests,
        rawMediaBudget,
        bytes
        ,
        longTaskCount: longTasks.length,
        maxLongTaskMs: longTasks.reduce((max, item) => Math.max(max, item.duration || 0), 0),
        totalLongTaskMs: longTasks.reduce((sum, item) => sum + (item.duration || 0), 0),
        domNodes: runtime.domNodes,
        imageElements: runtime.imageElements,
        videoElements: runtime.videoElements,
        canvasElements: runtime.canvasElements,
        memory: runtime.memory,
        queueInspector: runtime.queueInspector
      };
    })()
  `);
}

function subPageActionSource(action) {
  return `
    const visible = (node) => {
      if (!node) return false;
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    const clickFirstAvailable = (selector) => {
      const node = [...document.querySelectorAll(selector)].find(visible);
      if (!node) return false;
      node.click();
      return true;
    };
    const clickFirstNonActive = (selector) => {
      const node = [...document.querySelectorAll(selector)].find((item) => visible(item) && !/\\b(active|selected)\\b/.test(item.className || ''))
        || [...document.querySelectorAll(selector)].find(visible);
      if (!node) return false;
      node.click();
      return true;
    };
    const clickTextButton = (text) => {
      const node = [...document.querySelectorAll('button')].find((button) => visible(button) && (button.textContent || '').toLowerCase().includes(text.toLowerCase()));
      if (!node) return false;
      node.click();
      return true;
    };
    return ${action};
  `;
}

async function measureSubPage(win, item) {
  await clickRoute(win, { label: item.parentTab, tab: item.parentTab, selector: item.selector });
  return evaluate(win, `
    (async () => {
      const targetMs = ${latencyTargetMs};
      const rawMediaBudget = ${Number.isFinite(item.rawMediaBudget) ? item.rawMediaBudget : 0};
      const label = ${jsString(item.label)};
      const selector = ${jsString(item.selector)};
      const started = performance.now();
      const beforeHtml = document.querySelector(selector)?.innerText || '';
      const beforeResources = performance.getEntriesByType('resource').length;
      const beforeLongTasks = (window.__HAPA_LATENCY_LONG_TASKS__ || []).length;
      const acted = (() => { ${subPageActionSource(item.action)} })();
      if (!acted) {
        return { label, ok: true, skipped: true, reason: 'no-action-target', latencyMs: 0, settledMs: 0, targetMs };
      }
      let settledMs = null;
      while (performance.now() - started < ${routeTimeoutMs}) {
        const currentHtml = document.querySelector(selector)?.innerText || '';
        const contentChanged = currentHtml !== beforeHtml || !document.querySelector('.route-pending');
        if (contentChanged && !document.querySelector('.route-pending')) {
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          settledMs = performance.now() - started;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 16));
      }
      const resources = performance.getEntriesByType('resource').slice(beforeResources);
      const rawMediaRequests = resources.filter((entry) => /\\.(png|jpe?g|webp|gif|mp4|mov|webm|glb|gltf)(\\?|$)/i.test(entry.name || '')).length;
      const bytes = resources.reduce((sum, entry) => sum + (entry.transferSize || entry.encodedBodySize || 0), 0);
      const longTasks = (window.__HAPA_LATENCY_LONG_TASKS__ || []).slice(beforeLongTasks);
      const runtime = (${runtimeSnapshotSource("")});
      return {
        label,
        ok: settledMs !== null && settledMs <= targetMs && rawMediaRequests <= rawMediaBudget,
        skipped: false,
        settledMs: settledMs === null ? null : Math.round(settledMs),
        targetMs,
        reason: settledMs === null ? 'sub-page-timeout' : settledMs > targetMs ? 'target-missed' : rawMediaRequests > rawMediaBudget ? 'raw-media-budget-missed' : 'target-met',
        resourceCount: resources.length,
        rawMediaRequests,
        rawMediaBudget,
        bytes,
        longTaskCount: longTasks.length,
        maxLongTaskMs: longTasks.reduce((max, item) => Math.max(max, item.duration || 0), 0),
        totalLongTaskMs: longTasks.reduce((sum, item) => sum + (item.duration || 0), 0),
        domNodes: runtime.domNodes,
        imageElements: runtime.imageElements,
        videoElements: runtime.videoElements,
        canvasElements: runtime.canvasElements,
        memory: runtime.memory,
        queueInspector: runtime.queueInspector
      };
    })()
  `);
}

async function measureTypingProbe(win, item) {
  await clickRoute(win, { label: item.parentTab, tab: item.parentTab, selector: item.routeSelector || item.selector });
  if (item.action) {
    await evaluate(win, `
      (() => { ${subPageActionSource(item.action)} })()
    `);
    await sleep(Number(item.actionSettleMs || 120));
  }
  const focusResult = await evaluate(win, `
    (() => {
      const selector = ${jsString(item.selector)};
      const field = [...document.querySelectorAll(selector)].find((node) => {
        if (!node || node.disabled || node.readOnly) return false;
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      });
      if (!field) return { ok: false, reason: 'missing-field' };
      field.focus();
      const value = String(field.value || '');
      field.setSelectionRange?.(value.length, value.length);
      field.dataset.hapaLatencyProbe = ${jsString(item.label)};
      return { ok: true, initialValue: value, tagName: field.tagName, selector };
    })()
  `);
  if (!focusResult.ok) {
    return {
      label: item.label,
      ok: false,
      skipped: true,
      reason: focusResult.reason || "missing-field",
      keystrokeTargetMs,
      samples: []
    };
  }

  const text = item.text || " live";
  const samples = [];
  let expectedValue = focusResult.initialValue || "";
  for (const char of text) {
    expectedValue += char;
    const beforeLongTasks = await evaluate(win, `(window.__HAPA_LATENCY_LONG_TASKS__ || []).length`);
    const started = Date.now();
    await win.webContents.insertText(char);
    const echoed = await waitFor(win, `
      (() => {
        const field = document.querySelector(${jsString(`[data-hapa-latency-probe="${item.label}"]`)});
        return Boolean(field && String(field.value || '').endsWith(${jsString(expectedValue.slice(-Math.min(expectedValue.length, 48)))}));
      })()
    `, 2000);
    const echoMs = Date.now() - started;
    const longTasks = await evaluate(win, `(window.__HAPA_LATENCY_LONG_TASKS__ || []).slice(${beforeLongTasks})`);
    samples.push({
      char,
      echoed,
      echoMs,
      longTaskCount: Array.isArray(longTasks) ? longTasks.length : 0,
      maxLongTaskMs: Array.isArray(longTasks) ? longTasks.reduce((max, entry) => Math.max(max, entry.duration || 0), 0) : 0
    });
  }
  await evaluate(win, `
    (() => {
      const field = document.querySelector(${jsString(`[data-hapa-latency-probe="${item.label}"]`)});
      field?.blur?.();
      return true;
    })()
  `);
  await sleep(Number(item.settleMs || 360));

  const echoTimes = samples.map((sample) => sample.echoMs).sort((a, b) => a - b);
  const p95Index = Math.max(0, Math.ceil(echoTimes.length * 0.95) - 1);
  const p95Ms = echoTimes[p95Index] || 0;
  const maxMs = echoTimes.at(-1) || 0;
  const missedEchoes = samples.filter((sample) => !sample.echoed).length;
  const longTaskCount = samples.reduce((sum, sample) => sum + sample.longTaskCount, 0);
  const maxLongTaskMs = samples.reduce((max, sample) => Math.max(max, sample.maxLongTaskMs || 0), 0);
  return {
    label: item.label,
    parentTab: item.parentTab,
    ok: missedEchoes === 0 && p95Ms <= keystrokeTargetMs,
    skipped: false,
    keystrokeTargetMs,
    p95Ms,
    maxMs,
    missedEchoes,
    longTaskCount,
    maxLongTaskMs,
    samples
  };
}

function hypothesisForMiss(result) {
  if (result.reason === "raw-media-budget-missed") return "Visible window fetched more raw media than allowed; tighten virtualization, poster usage, or lazy media hydration.";
  if (result.rawMediaRequests > 0) return "Visible action is still fetching raw media; switch to thumbnail/poster metadata and hydrate originals on intent.";
  if ((result.bytes || 0) > 500000) return "Route is pulling an oversized JSON/media payload; add field filters, paging, or compact projection.";
  if (result.reason === "route-timeout" || result.reason === "sub-page-timeout") return "Route readiness selector or async data dependency is not reporting a usable state.";
  return "Render or derived-data work is blocking route settlement; profile React render and move derived work to cache/idle queue.";
}

function createGrowthSimulation(shellProbe) {
  const shell = shellProbe?.json || {};
  const avatarIndex = shell.avatarIndex || {};
  const kanban = shell.kanban || {};
  const lanes = Array.isArray(kanban.lanes) ? kanban.lanes : [];
  const avatarLimit = Number(avatarIndex.limit || shell.avatars?.length || 0);
  const loadedAvatars = Array.isArray(shell.avatars) ? shell.avatars.length : 0;
  const totalAvatars = Number(avatarIndex.total || shell.counts?.avatars || loadedAvatars);
  const boardWindowLimit = Number(kanban.cardWindowLimit || 12);
  const loadedBoardCards = lanes.reduce((sum, lane) => sum + (lane.cards?.length || 0), 0);
  const maxBoardWindow = Math.max(1, lanes.length) * boardWindowLimit;
  const currentBytes = shellProbe?.bytes || Buffer.byteLength(JSON.stringify(shell), "utf8");
  const simulatedCounts = {
    avatars: totalAvatars * 10,
    boardCards: Number(kanban.totalCards || loadedBoardCards) * 10,
    cards: Number(shell.counts?.cards || 0) * 10,
    media: Number(shell.counts?.media || 0) * 10
  };
  const boundedChecks = [
    {
      label: "avatar shell window",
      ok: loadedAvatars <= Math.max(avatarLimit, 1),
      detail: `${loadedAvatars}/${avatarLimit || loadedAvatars} loaded from ${totalAvatars} current avatars`
    },
    {
      label: "board card window",
      ok: loadedBoardCards <= maxBoardWindow,
      detail: `${loadedBoardCards}/${maxBoardWindow} visible board cards loaded`
    },
    {
      label: "shell world store",
      ok: shell.world?.overwindProjection === "shell",
      detail: shell.world?.overwindProjection || "missing"
    },
    {
      label: "shell item store",
      ok: shell.items?.overwindProjection === "shell",
      detail: shell.items?.overwindProjection || "missing"
    },
    {
      label: "shell payload budget",
      ok: currentBytes <= shellPayloadBudgetBytes,
      detail: `${currentBytes}/${shellPayloadBudgetBytes} bytes`
    }
  ];
  return {
    schemaVersion: "hapa.avatar-builder-growth-simulation.v1",
    multiplier: 10,
    currentBytes,
    shellPayloadBudgetBytes,
    simulatedCounts,
    loadedWindows: {
      avatars: loadedAvatars,
      avatarLimit,
      boardCards: loadedBoardCards,
      boardWindowLimit,
      lanes: lanes.length
    },
    boundedChecks,
    pass: boundedChecks.every((check) => check.ok),
    note: "Synthetic growth proof checks windowed shell contracts without copying real media."
  };
}

function markdownReport(report) {
  const lines = [];
  lines.push("# Hapa Avatar Builder Latency Report");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Target: ${report.targetMs} ms settled latency`);
  lines.push(`Keystroke target: ${report.keystrokeTargetMs} ms p95 echo latency`);
  lines.push(`Mode: ${report.mode}`);
  lines.push(`Route timeout: ${report.routeTimeoutMs} ms`);
  lines.push(`URL: ${report.targetUrl}`);
  lines.push(`Shell payload budget: ${report.shellPayloadBudgetBytes} bytes`);
  lines.push("");
  lines.push("## API Probes");
  lines.push("");
  lines.push("| Probe | Status | Latency | Bytes |");
  lines.push("|---|---:|---:|---:|");
  for (const probe of report.apiProbes) {
    lines.push(`| ${probe.label} | ${probe.statusCode} | ${probe.latencyMs} ms | ${probe.bytes} |`);
  }
  lines.push("");
  lines.push("## Page Routes");
  lines.push("");
  lines.push("| Route | Result | Content | Settled | Resources | Raw Media | Budget | Long Tasks | DOM | Canvas | Bytes |");
  lines.push("|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const route of report.routes) {
    lines.push(`| ${route.label} | ${route.ok ? "PASS" : "MISS"} | ${route.contentMs ?? ""} | ${route.settledMs ?? ""} | ${route.resourceCount ?? 0} | ${route.rawMediaRequests ?? 0} | ${route.rawMediaBudget ?? 0} | ${route.longTaskCount ?? 0} | ${route.domNodes ?? 0} | ${route.canvasElements ?? 0} | ${route.bytes ?? 0} |`);
  }
  lines.push("");
  lines.push("## Sub-Pages");
  lines.push("");
  lines.push("| Sub-page | Result | Settled | Resources | Raw Media | Budget | Long Tasks | DOM | Canvas | Bytes |");
  lines.push("|---|---|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const subPage of report.subPages) {
    lines.push(`| ${subPage.label} | ${subPage.skipped ? "SKIP" : subPage.ok ? "PASS" : "MISS"} | ${subPage.settledMs ?? ""} | ${subPage.resourceCount ?? 0} | ${subPage.rawMediaRequests ?? 0} | ${subPage.rawMediaBudget ?? 0} | ${subPage.longTaskCount ?? 0} | ${subPage.domNodes ?? 0} | ${subPage.canvasElements ?? 0} | ${subPage.bytes ?? 0} |`);
  }
  lines.push("");
  lines.push("## Keyboard Echo");
  lines.push("");
  lines.push("| Probe | Result | p95 | Max | Missed Echoes | Long Tasks | Max Long Task |");
  lines.push("|---|---|---:|---:|---:|---:|---:|");
  for (const probe of report.typing || []) {
    lines.push(`| ${probe.label} | ${probe.skipped ? "SKIP" : probe.ok ? "PASS" : "MISS"} | ${probe.p95Ms ?? ""} | ${probe.maxMs ?? ""} | ${probe.missedEchoes ?? ""} | ${probe.longTaskCount ?? 0} | ${probe.maxLongTaskMs ?? 0} |`);
  }
  lines.push("");
  lines.push("## Queue And Runtime");
  lines.push("");
  const queue = report.finalRuntimeSnapshot?.queueInspector || {};
  lines.push(`Queue state: ${queue.state || "unknown"}; active: ${queue.active ?? 0}; blockers: ${queue.blockers ?? 0}.`);
  lines.push(`DOM nodes: ${report.finalRuntimeSnapshot?.domNodes ?? 0}; images: ${report.finalRuntimeSnapshot?.imageElements ?? 0}; videos: ${report.finalRuntimeSnapshot?.videoElements ?? 0}; canvases: ${report.finalRuntimeSnapshot?.canvasElements ?? 0}.`);
  lines.push(`Long tasks captured: ${report.finalRuntimeSnapshot?.longTaskCountTotal ?? 0}; max long task: ${report.finalRuntimeSnapshot?.maxLongTaskMsTotal ?? 0} ms.`);
  lines.push("");
  lines.push("## Growth Simulation");
  lines.push("");
  if (report.growthSimulation) {
    lines.push(`Result: ${report.growthSimulation.pass ? "PASS" : "MISS"} for ${report.growthSimulation.multiplier}x synthetic growth without copying media.`);
    lines.push(`Shell bytes: ${report.growthSimulation.currentBytes}/${report.growthSimulation.shellPayloadBudgetBytes}.`);
    for (const check of report.growthSimulation.boundedChecks || []) {
      lines.push(`- ${check.ok ? "PASS" : "MISS"} ${check.label}: ${check.detail}`);
    }
  } else {
    lines.push("Growth simulation was not available.");
  }
  lines.push("");
  lines.push("## Miss Hypotheses");
  lines.push("");
  if (!report.misses.length) {
    lines.push("All measured page and sub-page latencies met target.");
  } else {
    for (const miss of report.misses) {
      lines.push(`- ${miss.label}: ${miss.settledMs ?? "timeout"} ms. Hypothesis: ${miss.hypothesis}`);
    }
  }
  lines.push("");
  lines.push("## Console Errors");
  lines.push("");
  lines.push(errors.length ? errors.map((error) => `- ${error}`).join("\n") : "None captured.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

app.whenReady().then(async () => {
  app.commandLine.appendSwitch("disable-background-timer-throttling");

  const apiProbes = [
    { label: "health", url: `${apiBase}/api/health` },
    { label: "kanban", url: `${apiBase}/api/kanban` },
    { label: "echos director summaries", url: `${apiBase}/api/echos/director-projects?summary=1` },
    { label: "echos gaps summary", url: `${apiBase}/api/echos/gaps?summary=1` },
    { label: "overwind bootstrap shell", url: `${apiBase}/api/overwind/bootstrap?mode=shell` },
    { label: "overwind bootstrap compact", url: `${apiBase}/api/overwind/bootstrap`, deep: true },
    { label: "overwind bootstrap fullAvatar", url: `${apiBase}/api/overwind/bootstrap?fullAvatar=1`, deep: true }
  ];
  const apiProbeResults = [];
  for (const probe of apiProbes.filter(shouldRun)) {
    console.log(`[latency] api ${probe.label}`);
    apiProbeResults.push({ label: probe.label, ...(await fetchHead(probe.url)) });
  }
  const shellProbe = await fetchJson(`${apiBase}/api/overwind/bootstrap?mode=shell`);
  const growthSimulation = createGrowthSimulation(shellProbe);

  const win = new BrowserWindow({
    width: 1440,
    height: 1000,
    show: false,
    backgroundColor: "#020617",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.webContents.on("console-message", (_event, level, message) => {
    if (level >= 3 && !/ResizeObserver loop|THREE.WebGLRenderer/.test(message)) {
      errors.push(message);
    }
  });

  try {
    const navigationStarted = Date.now();
    await win.loadURL(targetUrl);
    await installRuntimeObserver(win);
    const initial = await waitForAppShell(win);
    const navigationToShellMs = Date.now() - navigationStarted;

    const routeResults = [];
    const selectedRoutes = routes.filter(shouldRun);
    const selectedSubPages = subPages.filter(shouldRun);

    for (const route of selectedRoutes) {
      console.log(`[latency] route ${route.label}`);
      routeResults.push(await clickRoute(win, route));
    }

    const subPageResults = [];
    for (const item of selectedSubPages) {
      console.log(`[latency] sub-page ${item.label}`);
      subPageResults.push(await measureSubPage(win, item));
    }

    const typingResults = [];
    for (const item of typingProbes.filter(shouldRun)) {
      console.log(`[latency] typing ${item.label}`);
      typingResults.push(await measureTypingProbe(win, item));
    }

    const finalRuntimeSnapshot = await evaluate(win, runtimeSnapshotSource(""));

    const misses = [
      ...(navigationToShellMs > latencyTargetMs ? [{
        label: "Initial app shell",
        settledMs: navigationToShellMs,
        reason: "initial-shell-target-missed",
        hypothesis: "Startup is blocking usable shell on oversized bootstrap data; load a compact shell first and hydrate heavy stores through idle queues."
      }] : []),
      ...apiProbeResults.filter((probe) => probe.latencyMs > latencyTargetMs).map((probe) => ({
        label: `API: ${probe.label}`,
        settledMs: probe.latencyMs,
        reason: "api-target-missed",
        bytes: probe.bytes,
        hypothesis: probe.bytes > 500000 ? "API payload is too large for the latency budget; return a compact shell payload and build heavy projections asynchronously." : "API handler does blocking disk/JSON work; serve cache or move rebuild off request path."
      })),
      ...routeResults.filter((result) => !result.ok).map((result) => ({ ...result, hypothesis: hypothesisForMiss(result) })),
      ...subPageResults.filter((result) => !result.ok && !result.skipped).map((result) => ({ ...result, hypothesis: hypothesisForMiss(result) })),
      ...typingResults.filter((result) => !result.ok && !result.skipped).map((result) => ({
        ...result,
        settledMs: result.p95Ms,
        reason: "typing-target-missed",
        hypothesis: "Keystroke echo exceeded the near-realtime budget; keep field state local and defer store normalization, persistence, and media rerenders until blur or idle."
      })),
      ...(growthSimulation.pass ? [] : [{
        label: "10x growth simulation",
        settledMs: 0,
        reason: "growth-contract-missed",
        hypothesis: "Shell projection is not fully windowed or exceeds payload budget under synthetic growth; tighten avatar/board/page contracts."
      }])
    ];

    const report = {
      schemaVersion: "hapa.avatar-builder-latency-report.v1",
      generatedAt: nowIso(),
      targetUrl,
      apiBase,
      mode: latencyMode,
      targetMs: latencyTargetMs,
      keystrokeTargetMs,
      shellPayloadBudgetBytes,
      routeTimeoutMs,
      navigationToShellMs,
      initial,
      apiProbes: apiProbeResults,
      shellProbe: {
        ok: shellProbe.ok,
        statusCode: shellProbe.statusCode,
        latencyMs: shellProbe.latencyMs,
        bytes: shellProbe.bytes,
        avatarIndex: shellProbe.json?.avatarIndex || null,
        kanban: shellProbe.json?.kanban ? {
          overwindProjection: shellProbe.json.kanban.overwindProjection,
          totalCards: shellProbe.json.kanban.totalCards,
          cardWindowLimit: shellProbe.json.kanban.cardWindowLimit,
          hasMore: shellProbe.json.kanban.hasMore
        } : null
      },
      growthSimulation,
      routes: routeResults,
      subPages: subPageResults,
      typing: typingResults,
      misses,
      finalRuntimeSnapshot,
      pass: misses.length === 0 && navigationToShellMs <= latencyTargetMs && growthSimulation.pass,
      consoleErrors: errors
    };

    await fs.mkdir(artifactsDir, { recursive: true });
    await fs.writeFile(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await fs.writeFile(reportMarkdownPath, markdownReport(report), "utf8");
    console.log(JSON.stringify({
      ok: report.pass,
      targetMs: latencyTargetMs,
      navigationToShellMs,
      routeMisses: routeResults.filter((result) => !result.ok).length,
      subPageMisses: subPageResults.filter((result) => !result.ok && !result.skipped).length,
      typingMisses: typingResults.filter((result) => !result.ok && !result.skipped).length,
      typingP95MaxMs: typingResults.reduce((max, result) => Math.max(max, result.p95Ms || 0), 0),
      apiMisses: apiProbeResults.filter((probe) => probe.latencyMs > latencyTargetMs).length,
      growthPass: growthSimulation.pass,
      shellBytes: growthSimulation.currentBytes,
      mode: latencyMode,
      reportJsonPath,
      reportMarkdownPath
    }, null, 2));
    await app.quit();
    if (!report.pass) process.exit(1);
  } catch (error) {
    await fs.mkdir(artifactsDir, { recursive: true });
    const failure = {
      schemaVersion: "hapa.avatar-builder-latency-report.v1",
      generatedAt: nowIso(),
      targetUrl,
      apiBase,
      mode: latencyMode,
      targetMs: latencyTargetMs,
      keystrokeTargetMs,
      routeTimeoutMs,
      error: error instanceof Error ? error.stack || error.message : String(error),
      consoleErrors: errors
    };
    await fs.writeFile(reportJsonPath, `${JSON.stringify(failure, null, 2)}\n`, "utf8");
    console.error(failure.error);
    await app.quit();
    process.exit(1);
  }
});
