const fs = require('node:fs/promises');
const path = require('node:path');
const { hash } = require('./hell-week-contract.cjs');
async function json(file) { return JSON.parse(await fs.readFile(file, 'utf8')); }
function createHellWeekTransport({ root, dir, atomic, save, journal, credentialStore, fetchImpl, mediaStore, avatarReferences, now, textTimeoutMs, imageTimeoutMs, admitRecords = null, persistReceipts = false }) {
  async function paid(run, callId, stage, request) {
    const previous = run.calls[callId] || (persistReceipts ? await json(path.join(dir(run.id), `${callId}.receipt.json`)).catch(e => { if (e.code === 'ENOENT') return null; throw e; }) : null);
    const resultFile = path.join(dir(run.id), `${callId}.result.json`);
    if (previous) {
      if (persistReceipts) { run.calls[callId] = previous; run.attempts = Math.max(run.attempts, previous.globalAttempt || 0); }
      request = await json(path.join(dir(run.id), `${callId}.request.json`));
      if (hash(JSON.stringify(request)) !== previous.requestHash) throw Error('Saved request digest mismatch.');
      // The response receipt is committed before the run cursor. Recover that gap without replay.
      try {
        const result = await json(resultFile);
        if (result.requestHash !== previous.requestHash) throw Error('Receipt request digest mismatch.');
        run.calls[callId] = { ...previous, state: 'complete', usage: result.usage, responseId: result.responseId };
        await save(run); return result;
      } catch (e) { if (e.code !== 'ENOENT') throw e; }
      if (previous.state !== 'retry-authorized') throw Error(`Call ${callId} has no reusable response. Its outcome may be unknown; automatic replay is disabled.`);
    }
    if (admitRecords) await admitRecords();
    if (mediaStore) {
      const { treeBytes } = require('./hell-week-storage.cjs');
      if (!admitRecords && await treeBytes(root) + 4 * 1024 ** 2 > 128 * 1024 ** 2) throw Error('Private run records reached their shared 128 MiB ceiling.');
      if (stage === 'image') await mediaStore.reserve(`${run.id}:${callId}`);
    }
    // Reusable responses return above, even if a reference is now offline.
    const referenceImages = stage === 'image' && request.referenceImages?.length ? await avatarReferences?.readImages(request.referenceImages) : null;
    if (request.referenceImages?.length && !referenceImages) throw Error('Avatar image resolver is unavailable. No image request was sent.');
    const key = await credentialStore.read('openai');
    if (!key) throw Error('Save an OpenAI key in Provider API keys first.');
    const requestHash = hash(JSON.stringify(request));
    if (previous && previous.requestHash !== requestHash) throw Error('Request changed; refusing to retry under a different configuration.');
    const receipt = { globalAttempt: run.attempts + 1, state: 'submitted', stage, requestHash, attempt: (previous?.attempt || 0) + 1, submittedAt: new Date(now()).toISOString(),
      ...(previous?.retryAuthorization ? { retryAuthorization: previous.retryAuthorization } : {}) };
    await atomic(path.join(dir(run.id), `${callId}.request.json`), request);
    run.calls[callId] = receipt; run.attempts++; await save(run); await journal(run.id, { event: 'submitted', callId, ...receipt });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), stage === 'image' ? imageTimeoutMs : textTimeoutMs);
    let response;
    try {
      let payload = JSON.stringify(request);
      const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
      if (referenceImages) {
        payload = new FormData();
        for (const field of ['model', 'prompt', 'quality', 'size', 'output_format', 'n']) payload.append(field, String(request[field]));
        for (const image of referenceImages) payload.append('image[]', new Blob([image.bytes], { type: image.mimeType }), image.fileName);
        delete headers['Content-Type'];
      }
      response = await fetchImpl(`https://api.openai.com/v1/${stage === 'image' ? referenceImages ? 'images/edits' : 'images/generations' : 'responses'}`, {
        method: 'POST', redirect: 'error', headers, body: payload, signal: controller.signal });
      receipt.httpStatus = response.status;
      receipt.requestId = response.headers.get('x-request-id');
      if (!response.ok) {
        // Do not persist provider error bodies: they can echo source text or request credentials.
        receipt.state = response.status >= 400 && response.status < 500 ? 'rejected' : 'unknown';
        receipt.httpStatus = response.status; receipt.requestId = response.headers.get('x-request-id'); await save(run);
        throw Error(`OpenAI ${stage} request returned HTTP ${response.status}. ${response.status === 429 ? 'Check API credit and rate limits.' : 'Response retained as a failed request; no automatic retry.'}`);
      }
      const limit = stage === 'image' ? 24 * 1024 ** 2 : 1024 ** 2;
      const parts = []; let received = 0;
      for await (const part of response.body) { received += part.length; if (received > limit) throw Error('Provider response exceeded its admitted byte limit.'); parts.push(Buffer.from(part)); }
      const body = JSON.parse(Buffer.concat(parts).toString('utf8'));
      let result;
      if (stage === 'image') {
        const bytes = Buffer.from(body.data?.[0]?.b64_json || '', 'base64');
        if (bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw Error('OpenAI did not return a valid PNG.');
        const file = `${callId}.png`;
        const storage = mediaStore ? await mediaStore.put(bytes, `${run.id}:${callId}`) : null;
        if (!storage) await atomic(path.join(dir(run.id), file), bytes);
        result = { requestHash, ...(storage ? { storage } : { file }), sha256: hash(bytes), width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), usage: body.usage || null };
      } else {
        // Preserve the bounded response body before application validation, including refusals/incomplete outputs.
        result = { requestHash, body, usage: body.usage || null, responseId: body.id || null };
      }
      result.requestId = response.headers.get('x-request-id'); result.receivedAt = new Date(now()).toISOString();
      await atomic(resultFile, result);
      receipt.state = 'complete'; receipt.usage = result.usage; receipt.responseId = result.responseId || null;
      run.lastCommittedAt = result.receivedAt; await save(run); await journal(run.id, { event: 'response-committed', callId, requestId: result.requestId });
      return result;
    } catch (error) {
      if (receipt.state === 'submitted') {
        receipt.state = 'unknown';
        const candidate = error?.cause?.code || error?.code;
        const code = typeof candidate === 'string' && /^[A-Z0-9_]{1,64}$/.test(candidate) ? candidate : null;
        receipt.failure = { kind: error?.name === 'AbortError' ? 'timeout' : response ? 'response-not-committed' : 'connection',
          code, elapsedMs: now() - Date.parse(receipt.submittedAt), httpResponseReceived: !!response };
        await save(run);
        await journal(run.id, { event: 'request-outcome-unknown', callId, attempt: receipt.attempt, ...receipt.failure });
        if (!response) throw Error(`OpenAI connection ${receipt.failure.kind === 'timeout' ? 'timed out' : 'failed'}${code ? ` (${code})` : ''}. No response was saved for ${callId}; billing is unknown. Completed work is safe. Review this step before retrying.`);
      }
      throw error;
    } finally { clearTimeout(timer); }
  }
  return paid;
}
module.exports = { createHellWeekTransport };
