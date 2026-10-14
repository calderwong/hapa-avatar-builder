import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {prepareEchoPlaybackProxy} from '../../server/echo-playback-proxy.mjs';
const digest = async file => { const hash = createHash('sha256'); for await (const bytes of createReadStream(file)) hash.update(bytes); return hash.digest('hex'); };

/** Existing media owner prepares immutable decoded-frame equivalents. Original
 * identity stays on the cut; only the compiled rendition points at new bytes. */
export async function packagePreparedVideo({source, contract, output, cacheRoot, signal}) {
  if (contract?.type !== 'video') throw new Error('Prepared video packaging requires a video source');
  const result = await prepareEchoPlaybackProxy({sourcePath: source, proxyRoot: cacheRoot, purpose: 'prepared-export-lossless-v1', signal});
  const declared = String(contract.contentHash || '').replace(/^sha256:/, '');
  if (/^[a-f0-9]{64}$/.test(declared) && declared !== result.sourceHash) throw new Error('Prepared video original content hash changed');
  const compiledUri = `assets/media/${result.sourceHash}-lossless-${result.sha256.slice(0, 16)}.mp4`;
  const target = path.join(output, compiledUri), temporary = target + '.copy-' + randomUUID();
  await fs.mkdir(path.dirname(target), {recursive: true});
  try {
    if (signal?.aborted) throw new Error('Prepared video packaging canceled');
    await fs.copyFile(result.path, temporary);
    if (await digest(temporary) !== result.sha256) throw new Error('Prepared video derivative changed during packaging');
    if (signal?.aborted) throw new Error('Prepared video packaging canceled');
    await fs.rename(temporary, target);
  } finally { await fs.rm(temporary, {force: true}); }
  return { compiledUri, compiledSha256: 'sha256:' + result.sha256,
    compiledDerivation: {schemaVersion: 'hapa.hyperframes.lossless-video.v1', profile: result.settings.purpose,
      originalSha256: 'sha256:' + result.sourceHash, sha256: 'sha256:' + result.sha256,
      byteSize: result.byteSize, cacheKey: result.key, decoder: result.decoder,
      sourceMetadata: result.settings.sourceMetadata, verification: result.losslessVerification} };
}
