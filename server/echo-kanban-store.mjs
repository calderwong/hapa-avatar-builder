import * as fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { acquireOwnedFileLock, releaseOwnedFileLock } from './owned-file-lock.mjs';

const MAX_BYTES = 32 * 1024 * 1024;
const statuses = new Set(['backlog', 'todo', 'in_progress', 'review', 'blocked', 'done']);
const digest = value => createHash('sha256').update(value).digest('hex');
const serialize = board => JSON.stringify(board, null, 2) + '\n';
function fail(code, statusCode, message) { return Object.assign(new Error(message), { code, statusCode }); }

// A status command owns only one card's status. The existing board remains the
// projection, with a durable append-only intent journal and projection receipts.
export function createEchoKanbanStore({ boardPath, stateRoot, io = fs, readMirror = null }) {
  const journal = path.join(stateRoot, 'events.ndjson');
  const lock = path.join(stateRoot, 'writer.lock');
  async function readBounded(file, missing = '') {
    try {
      if ((await io.stat(file)).size > MAX_BYTES) throw fail('echo_board_size_limit', 413, 'Board history requires archival before another update.');
      return await io.readFile(file, 'utf8');
    } catch (error) { if (error.code === 'ENOENT') return missing; throw error; }
  }
  async function append(event) {
    const bytes = JSON.stringify(event) + '\n';
    const size = await io.stat(journal).then(info => info.size).catch(error => { if (error.code === 'ENOENT') return 0; throw error; });
    if (size + Buffer.byteLength(bytes) > MAX_BYTES - (event.type === 'status_changed' ? 1024 : 0)) throw fail('echo_board_size_limit', 413, 'Board history requires archival before another update.');
    const handle = await io.open(journal, 'a');
    try { await handle.writeFile(bytes); await handle.sync(); }
    finally { await handle.close(); }
  }
  async function atomicProjection(text) {
    const temp = boardPath + '.' + randomUUID() + '.tmp';
    try {
      const handle = await io.open(temp, 'wx');
      try { await handle.writeFile(text); await handle.sync(); } finally { await handle.close(); }
      await io.rename(temp, boardPath);
    } finally { await io.rm(temp, { force: true }).catch(() => {}); }
  }
  async function locked(operation) {
    await io.mkdir(stateRoot, { recursive: true });
    let owner;
    try { owner = acquireOwnedFileLock({ lockPath:path.resolve(lock), schemaVersion:'hapa.echo.kanban-lock.v1', staleLegacyMs:60000 }); }
    catch (error) {
      if (String(error.code||'').startsWith('OWNED_FILE_LOCK_')) throw fail('echo_board_busy',409,'Another writer owns the board lock, or its ownership cannot be safely established. Refresh before retrying.');
      throw error;
    }
    try { return await operation(); }
    finally { releaseOwnedFileLock(owner); }
  }
  function project(board, event) {
    if (event.resolution === "keep-current") return board;
    const next = structuredClone(board);
    const card = next.lanes?.find(lane => lane.id === event.laneId)?.cards?.find(card => card.id === event.cardId);
    if (!card) throw fail('echo_board_card_missing', 404, 'The card no longer exists in this lane.');
    card.status = event.status;
    next.updatedAt = event.at;
    return next;
  }
  async function load() {
    let text = await readBounded(boardPath);
    if (!text) throw fail('echo_board_missing', 404, 'Echo board is unavailable.');
    let board = JSON.parse(text);
    const history = (await readBounded(journal)).split('\n').filter(Boolean).map(line => JSON.parse(line));
    const applied = new Set(history.filter(event => event.type === 'projected').map(event => event.commandId));
    const resolved = new Set(history.filter(event => event.type === 'status_resolution').map(event=>event.originalCommandId));
    const conflicts = [];
    for (const event of history.filter(event => ['status_changed','status_resolution'].includes(event.type) && !applied.has(event.commandId) && !resolved.has(event.commandId))) {
      const revision = digest(text);
      const card = board.lanes?.find(lane=>lane.id===event.laneId)?.cards?.find(card=>card.id===event.cardId);
      if (!card) { conflicts.push({commandId:event.commandId,laneId:event.laneId,cardId:event.cardId,status:event.status,reason:'card-missing'});continue; }
      if (revision !== event.afterRevision && revision !== event.beforeRevision && card.status !== event.previousStatus && card.status !== event.status && event.resolution !== 'keep-current') {
        conflicts.push({commandId:event.commandId,laneId:event.laneId,cardId:event.cardId,status:event.status,currentStatus:card.status,previousStatus:event.previousStatus,reason:'status-changed-externally'});continue;
      }
      let nextText = text;
      if (revision !== event.afterRevision && card.status !== event.status && event.resolution !== 'keep-current') {
        const next=project(board,event);nextText=serialize(next);
        if (revision===event.beforeRevision && digest(nextText)!==event.afterRevision) throw fail('echo_board_history_invalid',409,'Projection hash did not match the recorded command.');
        // A single-card status command can be rebased over unrelated edits.
        // The receipt binds the actual result without rewriting its old intent.
        if (digest(await readBounded(boardPath))!==revision) throw fail('echo_board_revision_conflict',409,'An external writer changed the board during recovery. Refresh to retry.');
        await atomicProjection(nextText);text=nextText;board=next;
      }
      const receipt={type:'projected',commandId:event.commandId,at:new Date().toISOString(),revision:digest(nextText),intendedRevision:event.afterRevision,rebased:revision!==event.beforeRevision&&revision!==event.afterRevision};
      await append(receipt);history.push(receipt);
    }
    return { board, revision:digest(text),history,text,conflicts };
  }
  async function response(state, extra = {}) {
    const checkedAt=new Date().toISOString();
    let mirror={status:'not-configured',checkedAt};
    if(readMirror){try{mirror=await readMirror(state.board);if(!mirror||!mirror.status)throw new Error('Invalid mirror response');}catch(error){mirror={status:'unavailable',checkedAt,message:String(error.message||error).slice(0,300)};}}
    return { ...state.board, _sync: { revision:state.revision, localProjection:state.conflicts?.length?'conflict':'current',pendingCommands:state.conflicts||[],overwatch:mirror.status,mirror,checkedAt }, ...extra };
  }
  function validateInput(input) {
    if (!input || typeof input!=='object' || !/^[a-zA-Z0-9_-]{8,128}$/.test(input.commandId||'') || !/^[a-f0-9]{64}$/.test(input.expectedRevision||'')) throw fail('echo_board_command_required',422,'Send a card command with a commandId and expectedRevision. Whole-board replacement is not supported.');
  }
  return {
    read: () => locked(async () => response(await load())),
    resolveProjection: input => locked(async()=>{
      validateInput(input);
      if(!['keep-current','apply-recorded'].includes(input.resolution)||!String(input.reason||'').trim())throw fail('echo_board_resolution_required',422,'Choose which status to keep and explain the resolution.');
      const state=await load();
      const choice={originalCommandId:input.originalCommandId,resolution:input.resolution,reason:String(input.reason).trim().slice(0,2000)};
      const commandHash=digest(JSON.stringify(choice));
      const prior=state.history.find(event=>event.commandId===input.commandId&&event.type==='status_resolution');
      if(prior){if(prior.commandHash!==commandHash)throw fail('echo_board_command_conflict',409,'This commandId was used for another resolution.');return response(state,{idempotentReplay:true});}
      if(state.history.some(event=>event.commandId===input.commandId))throw fail('echo_board_command_conflict',409,'This commandId is already in use.');
      if(state.revision!==input.expectedRevision)throw fail('echo_board_revision_conflict',409,'The board changed. Refresh before resolving its pending status.');
      const conflict=state.conflicts.find(row=>row.commandId===input.originalCommandId);
      if(!conflict||conflict.reason==='card-missing')throw fail('echo_board_resolution_unavailable',409,'The recorded conflict is unavailable or its card was removed.');
      const event={type:'status_resolution',commandId:input.commandId,commandHash,...choice,laneId:conflict.laneId,cardId:conflict.cardId,status:choice.resolution==='keep-current'?conflict.currentStatus:conflict.status,previousStatus:conflict.currentStatus,beforeRevision:state.revision,at:new Date().toISOString()};
      const nextText=choice.resolution==='keep-current'?state.text:serialize(project(state.board,event));event.afterRevision=digest(nextText);
      const backupDir=path.join(stateRoot,'backups');await io.mkdir(backupDir,{recursive:true});await io.writeFile(path.join(backupDir,state.revision+'.json'),state.text,{flag:'wx'}).catch(error=>{if(error.code!=='EEXIST')throw error;});
      if(digest(await readBounded(boardPath))!==state.revision)throw fail('echo_board_revision_conflict',409,'The board changed while resolving the conflict. Refresh to retry.');
      await append(event);
      try{return response(await load(),{idempotentReplay:false});}catch(error){throw Object.assign(fail('echo_board_projection_pending',503,'Resolution recorded; refresh to recover its projection.'),{commandId:event.commandId});}
    }),
    changeStatus: input => locked(async () => {
      if (!input || typeof input !== 'object' || !/^[a-zA-Z0-9_-]{8,128}$/.test(input.commandId || '') || !/^[a-f0-9]{64}$/.test(input.expectedRevision || '') || !statuses.has(input.status)) {
        throw fail('echo_board_command_required', 422, 'Send a card status command with a commandId and expectedRevision. Whole-board replacement is not supported.');
      }
      const state = await load();
      const command = { laneId: input.laneId, cardId: input.cardId, status: input.status, reason: String(input.reason || '').trim().slice(0, 2000) };
      const commandHash = digest(JSON.stringify(command));
      const prior = state.history.find(event => event.type === 'status_changed' && event.commandId === input.commandId);
      if (!prior && state.history.some(event=>event.commandId===input.commandId)) throw fail('echo_board_command_conflict',409,'This commandId was already used by another board operation.');
      if (prior) {
        if (prior.commandHash !== commandHash) throw fail('echo_board_command_conflict', 409, 'This commandId was already used for a different change.');
        return response(state, { idempotentReplay: true });
      }
      if (state.conflicts.length) throw fail('echo_board_projection_conflict',409,'Review the pending status conflict before applying another change.');
      if (state.revision !== input.expectedRevision) throw fail('echo_board_revision_conflict', 409, 'The board changed. Refresh and review its current status before retrying.');
      const card = state.board.lanes?.find(lane => lane.id === command.laneId)?.cards?.find(card => card.id === command.cardId);
      if (!card) throw fail('echo_board_card_missing', 404, 'The card no longer exists in this lane.');
      if ((card.status === 'blocked' || command.status === 'blocked') && !command.reason) throw fail('echo_board_reason_required', 422, 'Blocking or unblocking requires an explicit reason.');
      if (card.status === command.status) return response(state, { unchanged: true });
      const event = { type: 'status_changed', commandId: input.commandId, commandHash, ...command, previousStatus: card.status, beforeRevision: state.revision, at: new Date().toISOString() };
      const next = project(state.board, event);
      const nextText = serialize(next);
      event.afterRevision = digest(nextText);
      const backupDir = path.join(stateRoot, 'backups');
      await io.mkdir(backupDir, { recursive: true });
      await io.writeFile(path.join(backupDir, state.revision + '.json'), state.text, { flag: 'wx' }).catch(error => { if (error.code !== 'EEXIST') throw error; });
      if (digest(await readBounded(boardPath)) !== state.revision) throw fail('echo_board_revision_conflict', 409, 'An external writer changed the board during this command. Refresh before retrying.');
      // Record intent before touching the projection. A failed projection is
      // recovered on the next read; never report it as an unrecorded command.
      await append(event);
      try {
        await atomicProjection(nextText);
        await append({ type: 'projected', commandId: event.commandId, at: new Date().toISOString(), revision: event.afterRevision });
      } catch (error) {
        throw Object.assign(fail('echo_board_projection_pending', 503, 'Status command was recorded; projection is pending. Refresh to recover; reuse the same commandId when retrying.'), { commandId: event.commandId });
      }
      return response({ board: next, revision: event.afterRevision }, { idempotentReplay: false });
    }),
  };
}
