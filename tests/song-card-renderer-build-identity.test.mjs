import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { inspectSongCardRendererBuildIdentity } from "../server/song-card-local-renderer.mjs";

function executable(filePath, source) {
  fs.writeFileSync(filePath, source);
  fs.chmodSync(filePath, 0o755);
}

test("strict renderer identity catches launcher retargets and NumPy package drift inside the warm TTL", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "renderer-identity-tools-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const bin = path.join(root, "bin");
  const pythonPathA = path.join(root, "python-path-a");
  const pythonPathB = path.join(root, "python-path-b");
  const numpyRootA = path.join(pythonPathA, "numpy");
  const numpyRootB = path.join(pythonPathB, "numpy");
  fs.mkdirSync(bin, { recursive: true });
  fs.mkdirSync(numpyRootA, { recursive: true });
  fs.mkdirSync(numpyRootB, { recursive: true });
  fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(root, "scripts/compile-hyperframes-show-v2.mjs"), "export const fixture = 1;\n");
  const numpyInitA = path.join(numpyRootA, "__init__.py");
  const numpyInitB = path.join(numpyRootB, "__init__.py");
  fs.writeFileSync(numpyInitA, "__version__='1.0.0'\n");
  fs.writeFileSync(numpyInitB, "__version__='2.0.0'\n");

  const ffmpegA = path.join(bin, "ffmpeg-a");
  const ffmpegB = path.join(bin, "ffmpeg-b");
  executable(ffmpegA, "#!/bin/sh\necho 'ffmpeg fixture A'\n");
  executable(ffmpegB, "#!/bin/sh\necho 'ffmpeg fixture B'\n");
  fs.symlinkSync(ffmpegA, path.join(bin, "ffmpeg"));
  executable(path.join(bin, "ffprobe"), "#!/bin/sh\necho 'ffprobe fixture'\n");
  const python = path.join(bin, "python-fixture");
  executable(python, `#!${process.execPath}\nconst path=require('node:path'); const code=process.argv[3]||''; if(process.argv[2]==='--version') console.log('Python fixture'); else if(code.includes('__file__')) console.log(path.join(process.env.PYTHONPATH,'numpy','__init__.py')); else console.log('1.0.0');\n`);

  const oldPath = process.env.PATH;
  const oldPython = process.env.HAPA_PYTHON;
  const oldPythonPath = process.env.PYTHONPATH;
  process.env.PATH = `${bin}${path.delimiter}${oldPath || ""}`;
  process.env.HAPA_PYTHON = python;
  process.env.PYTHONPATH = pythonPathA;
  t.after(() => {
    if (oldPath === undefined) delete process.env.PATH; else process.env.PATH = oldPath;
    if (oldPython === undefined) delete process.env.HAPA_PYTHON; else process.env.HAPA_PYTHON = oldPython;
    if (oldPythonPath === undefined) delete process.env.PYTHONPATH; else process.env.PYTHONPATH = oldPythonPath;
  });

  const first = await inspectSongCardRendererBuildIdentity({ root, refresh: true });
  const harmlessBin = path.join(root, "harmless-bin");
  fs.mkdirSync(harmlessBin);
  process.env.PATH = `${harmlessBin}${path.delimiter}${process.env.PATH}`;
  const sameResolvedTools = await inspectSongCardRendererBuildIdentity({ root, strict: true });
  assert.equal(
    sameResolvedTools.sha256,
    first.sha256,
    "ambient PATH prefixes must not change renderer identity when every resolved dependency is identical",
  );

  fs.unlinkSync(path.join(bin, "ffmpeg"));
  fs.symlinkSync(ffmpegB, path.join(bin, "ffmpeg"));
  const second = await inspectSongCardRendererBuildIdentity({ root, strict: true });
  assert.notEqual(second.sha256, first.sha256);
  assert.equal(second.tools.ffmpeg.path, fs.realpathSync(ffmpegB));

  process.env.PYTHONPATH = pythonPathB;
  const third = await inspectSongCardRendererBuildIdentity({ root, strict: true });
  assert.notEqual(third.sha256, second.sha256);
  assert.equal(third.tools.numpy.modulePath, fs.realpathSync(numpyInitB));

  fs.writeFileSync(path.join(numpyRootB, "core.py"), "changed=True\n");
  const fourth = await inspectSongCardRendererBuildIdentity({ root, strict: true });
  assert.notEqual(fourth.sha256, third.sha256);
  assert.equal(fourth.tools.numpy.modulePath, fs.realpathSync(numpyInitB));

  fs.symlinkSync(path.join(numpyRootB, "core.py"), path.join(numpyRootB, "linked.py"));
  await assert.rejects(
    inspectSongCardRendererBuildIdentity({ root, strict: true }),
    /dependency directories may not contain symlinks/i,
  );
});
