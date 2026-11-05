const { validateSelections, bindAvatarUses, cardAvatarLineage } = require('./hell-week-avatars.cjs');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { VERSION, AESTHETIC, hash, prepare, leoRequest, thorRequest, validateLeo, validateThor, evidenceRepairRequest, resolveEvidence } = require('./hell-week-contract.cjs');

async function atomic(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${randomUUID()}.tmp`;
  const handle = await fs.open(temp, 'wx', 0o600);
  try { await handle.writeFile(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value, null, 2)); await handle.sync(); }
  finally { await handle.close(); }
  await fs.rename(temp, file);
  const directory = await fs.open(path.dirname(file), 'r');
  try { await directory.sync(); } finally { await directory.close(); }
}
async function json(file) { return JSON.parse(await fs.readFile(file, 'utf8')); }
const safeError = error => String(error?.message || error).replace(/Bearer\s+[^\s"']+/gi, 'Bearer [redacted]').replace(/\bsk-[\w-]+/g, '[redacted]').slice(0, 500);

function createLegacyHellWeekGeneration({ userDataPath, credentialStore, fetchImpl = globalThis.fetch, registerCard, mediaStore = null, previewImage = null, avatarReferences = null,
  now = () => Date.now(), leaseMs = 30 * 60 * 1000, textTimeoutMs = 180000, imageTimeoutMs = 240000 } = {}) {
  if (!userDataPath || !credentialStore?.read || !registerCard) throw Error('Hell Week requires private local storage, a credential resolver and the Builder Card owner.');
  const root = path.join(userDataPath, 'Hell Week Runs');
  let active = null;
  let activeId = null;
  const dir = id => { if (!/^hw-[a-f0-9-]{36}$/.test(id)) throw Error('Invalid run ID.'); return path.join(root, id); };
  const save = run => { run.updatedAt = new Date(now()).toISOString(); return atomic(path.join(dir(run.id), 'run.json'), run); };
  async function read(id) {
    const run = await json(path.join(dir(id), 'run.json'));
    const plan = await json(path.join(dir(id), 'source.json'));
    if (hash(JSON.stringify(plan)) !== run.planHash) throw Error('Source/configuration digest changed. Run is quarantined.');
    if (plan.avatars && hash(JSON.stringify(run.avatars)) !== hash(JSON.stringify(plan.avatars))) throw Error('Avatar snapshot digest changed. Run is quarantined.');
    return { run, plan };
  }
  async function journal(id, event) {
    const handle = await fs.open(path.join(dir(id), 'events.ndjson'), 'a', 0o600);
    try { await handle.writeFile(JSON.stringify({ at: new Date(now()).toISOString(), ...event }) + '\n'); await handle.sync(); }
    finally { await handle.close(); }
  }
  async function lock(id, reclaimed = false) {
    await fs.mkdir(root, { recursive: true, mode: 0o700 });
    const file = path.join(root, 'worker.lock');
    try {
      const handle = await fs.open(file, 'wx', 0o600);
      await handle.writeFile(JSON.stringify({ pid: process.pid, runId: id })); await handle.sync(); await handle.close();
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      const owner = await json(file);
      try { process.kill(owner.pid, 0); throw Error('Another Hell Week worker owns the queue.'); }
      catch (probe) {
        if (probe.code !== 'ESRCH') throw probe;
        if (reclaimed) throw Error('Worker ownership changed while reclaiming its lock; retry after checking status.');
        // Only a proven-dead exact process lock can be reclaimed, once. No active worker takeover.
        await fs.rename(file, `${file}.${randomUUID()}.abandoned`);
        return lock(id, true);
      }
    }
    return () => fs.unlink(file);
  }
  async function create(input) {
    const plan = prepare(input);
    const selections = validateSelections(input.avatarSelections);
    if (selections.length) {
      if (!avatarReferences) throw Error('Avatar references are unavailable in this host.');
      plan.avatars = await avatarReferences.snapshot(selections);
    }
    const id = `hw-${randomUUID()}`;
    const run = { id, schema: VERSION, name: plan.name, sourceHash: plan.sourceHash, planHash: hash(JSON.stringify(plan)),
      config: plan.config, ...(plan.avatars ? { avatars: plan.avatars } : {}), createdAt: new Date(now()).toISOString(), state: 'prepared', plannedCalls: plan.plannedCalls,
      totalCards: plan.chunks.length, calls: {}, cards: [], leo: [], attempts: 0, pauseRequested: false, lastCommittedAt: null,
      forecast: plan.forecast, error: null };
    await atomic(path.join(dir(id), 'source.json'), plan); await save(run); await journal(id, { event: 'prepared', sourceHash: plan.sourceHash });
    return run;
  }
  const paid = require('./hell-week-transport.cjs').createHellWeekTransport({ root, dir, atomic, save, journal, credentialStore, fetchImpl, mediaStore, avatarReferences, now, textTimeoutMs, imageTimeoutMs });
  function textRequest(model, spec) {
    return { model, store: false, instructions: spec.instructions, input: spec.input, max_output_tokens: 5000,
      text: { format: { type: 'json_schema', name: 'hapa_card_stage', strict: true, schema: spec.schema } } };
  }
  function parsed(result) {
    if (result.body.status !== 'completed') throw Error('Agent response is incomplete; saved output needs review.');
    const content = (result.body.output || []).flatMap(o => o.content || []);
    if (content.some(c => c.type === 'refusal')) throw Error('Agent declined this source. The response is retained for review.');
    const text = content.filter(c => c.type === 'output_text').map(c => c.text).join('');
    try { return JSON.parse(text); } catch { throw Error('Agent response is not valid structured output.'); }
  }
  async function execute(id, unlock, maxNewCalls = Infinity, repairLeoWindow = null, stopAfterLeo = false, repairThorEvidence = false) {
    let run;
    try {
      const loaded = await read(id); run = loaded.run; const plan = loaded.plan;
      await registerCard.preflight?.({ run });
      if (mediaStore && !stopAfterLeo) await mediaStore.preflight();
      const deadline = now() + leaseMs;
      const admittedAttempts = run.attempts;
      run.state = 'running'; run.error = null; await save(run);
      const admit = async (stage, millis) => {
        const onDisk = await json(path.join(dir(id), 'control.json')).catch(e => { if (e.code === 'ENOENT') return {}; throw e; });
        if (onDisk.pauseRequested || run.attempts - admittedAttempts >= maxNewCalls || now() + millis + 30000 > deadline) {
          run.state = onDisk.pauseRequested || run.attempts - admittedAttempts >= maxNewCalls ? 'paused' : 'yielded';
          if (run.attempts - admittedAttempts >= maxNewCalls) run.stage = 'Recovery step saved · resume when ready'; run.pauseRequested = onDisk.pauseRequested; await save(run); return false;
        }
        run.stage = stage; await save(run); return true;
      };
      for (let i = 0; i < plan.leoWindows.length; i++) {
        if (run.leo[i]) continue;
        if (!await admit(`LEO · ${i + 1}/${plan.leoWindows.length}`, textTimeoutMs)) return;
        const ids = plan.leoWindows[i];
        const result = await paid(run, `leo-${i}`, 'leo', textRequest(plan.config.leoModel, leoRequest(plan, ids, run.leo)));
        try { run.leo[i] = validateLeo(parsed(result), ids); }
        catch (error) {
          if (error.code !== 'LEO_MISSING_PREPARATION') throw error;
          run.leoCoverage = { windowIndex: i, expected: ids, missing: error.missing, savedCount: error.partial.preparation.length };
          await save(run);
          if (repairLeoWindow !== i) throw error;
          if (!await admit(`Completing LEO · ${i + 1}/${plan.leoWindows.length}`, textTimeoutMs)) return;
          const repairId = `leo-${i}-coverage-repair`;
          const repaired = await paid(run, repairId, 'leo', textRequest(plan.config.leoModel, leoRequest(plan, error.missing, run.leo)));
          const extra = validateLeo(parsed(repaired), error.missing);
          run.leo[i] = validateLeo({ ...error.partial, preparation: [...error.partial.preparation, ...extra.preparation] }, ids);
          run.leo[i].coverageRepair = { callId: repairId, originalCallId: `leo-${i}`, repairedChunkIds: error.missing };
          delete run.leoCoverage;
          await journal(id, { event: 'leo-coverage-repaired', windowIndex: i, chunkIds: error.missing, callId: repairId });
        }
        await save(run);
        if (repairLeoWindow === i) { run.state = 'paused'; run.stage = 'LEO preparation repaired · resume when ready'; delete run.repairLeoWindow; await save(run); return; }
      }
      if (stopAfterLeo) { run.state = 'paused'; run.stage = 'LEO complete · ready for Card design'; await save(run); return; }
      for (const [i, chunk] of plan.chunks.entries()) {
        let card = run.cards[i];
        if (!card) {
          if (!await admit(`Thor · ${i + 1}/${plan.chunks.length}`, textTimeoutMs)) return;
          const context = run.leo.find(l => l.preparation.some(p => p.chunk_id === chunk.id));
          const result = await paid(run, `thor-${i}`, 'thor', textRequest(plan.config.thorModel, thorRequest(plan, chunk, context, run.cards.map(c => c.design))));
          let design;
          try { design = validateThor(resolveEvidence(parsed(result), chunk), chunk); }
          catch (error) {
            if (error.code !== 'THOR_EVIDENCE') throw error;
            run.thorEvidence = { cardIndex: i, callId: `thor-${i}` }; await save(run);
            if (!repairThorEvidence) throw error;
            if (!await admit(`Repairing source evidence · ${i + 1}/${plan.chunks.length}`, textTimeoutMs)) return;
            const original = parsed(result), repairId = `thor-${i}-evidence-repair-v2`;
            const repaired = parsed(await paid(run, repairId, 'thor', textRequest(plan.config.thorModel, evidenceRepairRequest(chunk, original))));
            design = validateThor({ ...original, evidence_quotes: resolveEvidence({ evidence_quote_ids: [repaired.evidence_quote_id] }, chunk).evidence_quotes }, chunk);
            design.unverifiedEvidenceQuotes = original.evidence_quotes;
            design.validationWarnings = ['Original proposed quotes were paraphrases; exact source excerpts were selected in a separate saved repair.'];
            design.evidenceRepair = { callId: repairId, originalCallId: `thor-${i}` };
            delete run.thorEvidence;
            await journal(id, { event: 'thor-evidence-repaired', cardIndex: i, callId: repairId });
          }
          design = bindAvatarUses(plan, design);
          card = { avatarLineage: cardAvatarLineage(plan.avatars, design.avatar_uses), id: `${run.id}-card-${i + 1}`, chunkId: chunk.id, design, state: 'designed' };
          run.cards[i] = card; await save(run);
        }
        if (!card.image) {
          if (!await admit(`Artwork · ${i + 1}/${plan.chunks.length}`, imageTimeoutMs)) return;
          const uses = card.design.avatar_uses || [];
          const used = uses.map(use => ({ avatar: (plan.avatars || []).find(a => a.avatarId === use.avatar_id), use }));
          if (used.some(x => !x.avatar)) throw Error('Unknown Avatar in saved Card design.');
          const references = used.filter(x => x.avatar.image);
          const direction = used.length ? '\n\nAvatar direction (creative references, not document evidence):\n' + used.map(({ avatar, use }) => `${avatar.name}: ${use.role}. ${use.reason}${avatar.image ? ` Reference image ${references.findIndex(x => x.avatar.avatarId === avatar.avatarId) + 1}; preserve recognizable identity.` : ' Text profile only: ' + JSON.stringify(avatar.context)}`).join('\n') + '\nKeep the adventurous scene and composition; do not reproduce a reference sheet or collage.' : '';
          card.imagePrompt = `${card.design.image_prompt}\n\n${AESTHETIC}${direction}`;
          card.image = await paid(run, `image-${i}`, 'image', { model: plan.config.imageModel, prompt: card.imagePrompt,
            quality: plan.config.quality, size: plan.config.size, output_format: 'png', n: 1, ...(references.length ? { referenceImages: references.map(x => x.avatar.image) } : {}) });
          card.state = 'illustrated'; await save(run);
        }
        if (!card.registration) {
          if (!await admit(`Saving Card · ${i + 1}/${plan.chunks.length}`, 30000)) return;
          const bytes = card.image.storage ? await mediaStore.read(card.image.storage) : await fs.readFile(path.join(dir(id), card.image.file));
          if (hash(bytes) !== card.image.sha256) throw Error('Artwork digest mismatch.');
          card.registration = await registerCard({ run, card, chunk, imageBytes: bytes });
          card.state = 'saved'; run.lastCommittedAt = new Date(now()).toISOString(); await save(run);
          await journal(id, { event: 'card-saved', cardId: card.id, imageSha256: card.image.sha256 });
        }
      }
      run.state = 'complete'; run.stage = 'Ready for review'; await save(run);
    } catch (error) {
      if (run && unlock) { run.state = 'blocked'; run.error = safeError(error); await save(run); await journal(id, { event: 'blocked', error: run.error }); }
      else throw error;
    } finally { if (unlock) await unlock(); }
  }
  async function start({ id, retryRejected = false, retryUnknownCallId = null, acknowledgePossibleDuplicateCharge = false, repairLeoWindow = null, stopAfterLeo = false, repairThorEvidence = false } = {}) {
    if (active) throw Error('A Hell Week run is already active.');
    // Acquire ownership before reading/mutating a cursor. A second shell/CLI must
    // get a visible admission error, never overwrite another worker's progress.
    const unlock = await lock(id);
    try {
      const { run } = await read(id);
      if (run.state === 'complete') { await unlock(); return run; }
      async function authorize(callId, receipt, mode) {
        // Archive the original request and receipt before making a manual retry
        // admissible. The raw source/configuration and successful calls stay fixed.
        const archive = path.join(dir(id), 'attempts', `${callId}-${receipt.attempt}`);
        await atomic(`${archive}.receipt.json`, receipt);
        await atomic(`${archive}.request.json`, await fs.readFile(path.join(dir(id), `${callId}.request.json`)));
        receipt.retryAuthorization = { mode, at: new Date(now()).toISOString(), possibleDuplicateChargeAcknowledged: mode === 'unknown-outcome' };
        receipt.state = 'retry-authorized';
        await journal(id, { event: 'manual-retry-authorized', callId, attempt: receipt.attempt + 1, ...receipt.retryAuthorization });
      }
      if (repairLeoWindow !== null) {
        if (retryUnknownCallId || retryRejected || !Number.isInteger(repairLeoWindow) || repairLeoWindow < 0) throw Error('Choose one recovery action at a time.');
        const { plan } = await read(id);
        const ids = plan.leoWindows[repairLeoWindow];
        if (!ids || run.leo[repairLeoWindow] || run.calls[`leo-${repairLeoWindow}`]?.state !== 'complete') throw Error('This LEO window is not eligible for coverage repair.');
        const original = await json(path.join(dir(id), `leo-${repairLeoWindow}.result.json`));
        try { validateLeo(parsed(original), ids); throw Error('LEO coverage is already complete. Use ordinary Resume.'); }
        catch (e) { if (e.code !== 'LEO_MISSING_PREPARATION') throw e; }
        run.repairLeoWindow = repairLeoWindow;
      }
      if (retryUnknownCallId) {
        if (!acknowledgePossibleDuplicateCharge) throw Error('Recovery requires explicit acknowledgement that this request may already have been billed.');
        const receipt = run.calls[retryUnknownCallId];
        if (!receipt || !['unknown', 'submitted'].includes(receipt.state) || receipt.attempt >= 2) throw Error('This uncertain request is not eligible for another retry.');
        try { await fs.access(path.join(dir(id), `${retryUnknownCallId}.result.json`)); throw Error('A saved response exists. Use ordinary Resume to recover it without another paid call.'); }
        catch (e) { if (e.code !== 'ENOENT') throw e; }
        await authorize(retryUnknownCallId, receipt, 'unknown-outcome');
        run.recoveryStopAfterCall = retryUnknownCallId;
      } else if (retryRejected) {
        for (const [callId, receipt] of Object.entries(run.calls)) {
          if (receipt.state === 'rejected' && receipt.attempt < 2) await authorize(callId, receipt, 'known-rejection');
        }
      }
      const recoveryOnly = !!run.recoveryStopAfterCall && run.calls[run.recoveryStopAfterCall]?.state !== 'complete';
      if (!recoveryOnly) delete run.recoveryStopAfterCall;
      run.pauseRequested = false;
      await atomic(path.join(dir(id), 'control.json'), { pauseRequested: false });
      await save(run);
      activeId = id;
      active = execute(id, unlock, recoveryOnly ? 1 : Infinity, run.repairLeoWindow ?? null, stopAfterLeo, repairThorEvidence).finally(() => { active = null; activeId = null; });
      active.catch(() => {});
      return { ...run, state: 'starting' };
    } catch (error) { await unlock(); throw error; }
  }
  async function worker() {
    try {
      const owner = await json(path.join(root, 'worker.lock'));
      try { process.kill(owner.pid, 0); } catch (e) { if (e.code === 'ESRCH') return null; if (e.code !== 'EPERM') throw e; }
      return owner;
    } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
  }
  async function pause({ id }) { const { run } = await read(id); await atomic(path.join(dir(id), 'control.json'), { pauseRequested: true }); return { ...run, pauseRequested: true }; }
  async function status({ id } = {}) {
    if (id) { const run = await json(path.join(dir(id), 'run.json')); const live = activeId === id || (await worker())?.runId === id;
      return { ...run, workerActive: live, state: run.state === 'running' && !live ? 'interrupted' : run.state }; }
    await fs.mkdir(root, { recursive: true, mode: 0o700 });
    const ids = (await fs.readdir(root)).filter(id => /^hw-[a-f0-9-]{36}$/.test(id));
    const runs = await Promise.all(ids.map(id => status({ id })));
    return { runs: runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt)), activeId: activeId || (await worker())?.runId || null };
  }
  async function reconcile({ id }) {
    const unlock = await lock(id);
    try {
      const {run, plan} = await read(id);
      for (const card of run.cards) {
        if (!card.image) continue;
        const imageBytes = card.image.storage ? await mediaStore.read(card.image.storage) : await fs.readFile(path.join(dir(id),card.image.file));
        if (hash(imageBytes) !== card.image.sha256) throw Error('Artwork digest mismatch.');
        card.registration = await registerCard({ run, card, chunk: plan.chunks.find(c=>c.id===card.chunkId), imageBytes });
        card.state = 'saved'; await save(run);
      }
      run.state = run.cards.filter(c=>c.state==='saved').length===run.totalCards ? 'complete' : 'paused';
      run.stage = 'Saved Card links verified'; run.error = null;
      await save(run); await journal(id,{event:'card-links-reconciled',saved:run.cards.filter(c=>c.state==='saved').length});
      return run;
    } finally { await unlock(); }
  }
  async function asset({ id, cardId }) {
    const { run } = await read(id); const card = run.cards.find(c => c.id === cardId);
    if (!card?.image) throw Error('No artwork for this Card.');
    const bytes = card.image.storage ? await mediaStore.read(card.image.storage) : await fs.readFile(path.join(dir(id), card.image.file));
    if (hash(bytes) !== card.image.sha256) throw Error('Artwork digest mismatch.');
    return { dataUrl: previewImage ? await previewImage(bytes) : `data:image/png;base64,${bytes.toString('base64')}` };
  }
  return { _lock: lock, _worker: worker, avatars: () => { if (!avatarReferences) throw Error('Avatar references unavailable.'); return avatarReferences.catalog(); }, avatarOptions: payload => { if (!avatarReferences) throw Error('Avatar references unavailable.'); return avatarReferences.details(payload); }, create, start, pause, status, asset, reconcile, _active: () => active, root };
}
function createHellWeekGeneration(options = {}) {
  const legacy = createLegacyHellWeekGeneration(options);
  if (options.legacyOnly) return legacy;
  const semantic = require('./hell-week-semantic.cjs').createSemanticHellWeek({ ...options, atomic, safeError, lock: legacy._lock, worker: legacy._worker, root: legacy.root });
  async function owner(id) {
    if (!/^hw-[a-f0-9-]{36}$/.test(id)) throw Error('Invalid run ID.');
    const run = await json(path.join(legacy.root, id, 'run.json'));
    return run.schema === 'hapa.builder-hell-week.v2' ? semantic : legacy;
  }
  return { ...legacy,
    create: input => semantic.create(input),
    importDesigns: raw => semantic.importDesigns(raw),
    prepareMore: input => semantic.prepareMore(input),
    start: async input => (await owner(input.id)).start(input),
    pause: async input => (await owner(input.id)).pause(input),
    asset: async input => (await owner(input.id)).asset(input),
    reconcile: async input => (await owner(input.id)).reconcile(input),
    status: async input => {
      if (input?.id) return (await owner(input.id)).status(input);
      await fs.mkdir(legacy.root, { recursive: true });
      const limit = Math.max(1, Math.min(50, input?.runsLimit || 25)); const runs = [];
      for await (const entry of await fs.opendir(legacy.root)) {
        if (!/^hw-[a-f0-9-]{36}$/.test(entry.name)) continue;
        const r = await json(path.join(legacy.root, entry.name, 'run.json'));
        runs.push(r); runs.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)); runs.length=Math.min(runs.length, limit);
      }
      const live = await legacy._worker();
      return { runs: runs.map(r=>({...r, cards:r.schema === 'hapa.builder-hell-week.v2'?[]:r.cards, workerActive:live?.runId===r.id, state:['running','importing'].includes(r.state)&&live?.runId!==r.id?'interrupted':r.state})), activeId:live?.runId||null };
    },
    _active: () => semantic._active() || legacy._active()
  };
}
module.exports = { createHellWeekGeneration, atomic, safeError };
