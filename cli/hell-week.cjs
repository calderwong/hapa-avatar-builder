const { createHellWeekAvatarReferences } = require('../electron/hell-week-avatars.cjs');
const { createHellWeekStorage } = require('../electron/hell-week-storage.cjs');
// Run with the repository's Electron executable; no child processes or renderer.
const { app, safeStorage } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
// Establish the OS credential identity synchronously, before the first await.
app.setName('hapa-avatar-builder');
app.setPath('userData', path.join(app.getPath('appData'), 'hapa-avatar-builder'));
const { createProviderCredentialStore } = require('../electron/provider-credential-store.cjs');
const { createHellWeekGeneration, safeError } = require('../electron/hell-week-generation.cjs');
const { createHellWeekRegistrar } = require('../electron/hell-week-registration.cjs');
const root = path.resolve(__dirname, '..');
app.whenReady().then(async () => {
  const [command = 'status', value, ...rest] = process.argv.slice(2);
  const option = name => process.argv.slice(2).find(s => s.startsWith(`--${name}=`))?.slice(name.length + 3);
  try {
    if (command === '--help') {
      console.log('hell-week.cjs status [RUN_ID] | avatars | avatar-options ID | create FILE [--avatars=ID,ID] [--avatar-selections=FILE.json] | prepare RUN_ID | run/resume RUN_ID [--design-only] [--images=COUNT] | pause RUN_ID | reconcile LEGACY_RUN_ID (no paid generation)\nUse --api-base=http://127.0.0.1:8797 and HAPA_AVATAR_ADMIN_TOKEN for Card registration. create performs no paid calls. run/resume performs paid OpenAI requests. --retry-rejected permits one retry of a known rejected request; unknown outcomes never automatically replay. --retry-unknown=CALL_ID --acknowledge-possible-duplicate-charge permits one explicitly acknowledged recovery request, then pauses. --repair-thor-evidence selects exact source quotations for a saved design, then continues. --repair-leo-window=2 completes only missing preparations in zero-based LEO window 2 and pauses.'); return;
    }
    if (option('max-cards') !== undefined) throw Error('--max-cards is retired for new runs. Card discovery has no fixed count limit; use --images=COUNT on run/resume to pause artwork after a batch.');
    const credentialStore = createProviderCredentialStore({ userDataPath: app.getPath('userData'), repositoryRoot: root, safeStorage });
    const engine = createHellWeekGeneration({ avatarReferences: createHellWeekAvatarReferences({ repositoryRoot: root, apiBase: option('api-base') || 'http://127.0.0.1:8797' }), mediaStore: createHellWeekStorage({ configFile: path.join(app.getPath("userData"), "hell-week-storage.json") }), userDataPath: app.getPath('userData'), credentialStore,
      registerCard: createHellWeekRegistrar({ repositoryRoot: root, apiBase: option('api-base') || 'http://127.0.0.1:8797', adminToken: process.env.HAPA_AVATAR_ADMIN_TOKEN || '' }) });
    let result;
    if (command === 'avatars') result = await engine.avatars();
    else if (command === 'avatar-options') result = await engine.avatarOptions({ avatarId: value });
    else if (command === 'create') result = await engine.create({ workflow: 'semantic', name: path.basename(value), filePath: path.resolve(value), avatarSelections: option('avatar-selections') ? JSON.parse(await fs.readFile(option('avatar-selections'), 'utf8')) : (option('avatars') || '').split(',').filter(Boolean).map(avatarId => ({ avatarId })) });
    else if (command === 'prepare') { await engine.prepareMore({id:value}); await engine._active(); result = await engine.status({id:value}); }
    else if (['run', 'resume'].includes(command)) { await engine.start({ id: value, mode: rest.includes('--design-only') ? 'design' : 'all', imageLimit: option('images') === undefined ? null : Number(option('images')), retryRejected: rest.includes('--retry-rejected'), retryUnknownCallId: option('retry-unknown') || null, acknowledgePossibleDuplicateCharge: rest.includes('--acknowledge-possible-duplicate-charge'), repairThorEvidence: rest.includes('--repair-thor-evidence'), repairLeoWindow: option('repair-leo-window') === undefined ? null : Number(option('repair-leo-window')) }); await engine._active(); result = await engine.status({ id: value }); }
    else if (command === 'reconcile') result = await engine.reconcile({ id: value });
    else if (command === 'pause') result = await engine.pause({ id: value });
    else if (command === 'status') result = await engine.status(value ? { id: value } : {});
    else throw Error('Unknown command. Use --help.');
    if (command === 'create') { await engine._active(); result = await engine.status({ id: result.id }); }
    console.log(JSON.stringify({ ok: result.state !== 'blocked', ...result }, null, 2));
    if (result.state === 'blocked') process.exitCode = 1;
  } catch (error) { console.error(JSON.stringify({ ok: false, error: safeError(error) })); process.exitCode = 1; }
  finally { app.exit(process.exitCode || 0); }
});
