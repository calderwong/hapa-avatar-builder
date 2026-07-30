import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  auditHyperFramesShaderFidelity,
  loadVerifiedIsfCatalog,
  promoteVerifiedIsfInstances,
} from "../scripts/lib/hyperframes-isf-fidelity.mjs";

const sha256 = (value) => `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;

test("hash-verified generator, filter, and persistent shaders are promoted without atlas fallback", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hapa-isf-fidelity-"));
  const manifestPath = path.join(root, "web/isf/manifest.json");
  const proxyRegistryPath = path.join(root, "web/isf/proxies/native-exact-proxies.json");
  const shaderDirectory = path.join(root, "web/isf/shaders");
  const runtimePath = path.join(root, "web/vendor/isf-renderer.js");
  fs.mkdirSync(shaderDirectory, { recursive: true });
  fs.mkdirSync(path.dirname(runtimePath), { recursive: true });
  fs.writeFileSync(runtimePath, "window.interactiveShaderFormat={};\n");
  const sources = {
    generator: "/*{\"INPUTS\":[]}*/\nvoid main(){gl_FragColor=vec4(1.0);}\n",
    filter: "/*{\"INPUTS\":[{\"NAME\":\"inputImage\",\"TYPE\":\"image\"}]}*/\nvoid main(){gl_FragColor=IMG_THIS_PIXEL(inputImage);}\n",
    persistent: "/*{\"INPUTS\":[{\"NAME\":\"inputImage\",\"TYPE\":\"image\"}],\"PASSES\":[{\"TARGET\":\"buffer\",\"persistent\":true},{}]}*/\nvoid main(){gl_FragColor=vec4(1.0);}\n",
  };
  const shaders = Object.entries(sources).map(([shaderId, source]) => {
    const file = `${shaderId}.fs`;
    fs.writeFileSync(path.join(shaderDirectory, file), source);
    return {
      id: `isf:${shaderId}`,
      shaderId,
      title: shaderId,
      shaderType: shaderId === "generator" ? "generator" : "filter",
      source: `/static/isf/shaders/${file}`,
      sourceHash: sha256(source),
      enabled: true,
      directorEligible: true,
      inputs: shaderId === "generator" ? [] : [{ NAME: "inputImage", TYPE: "image" }],
    };
  });
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify({ shaders }));
  fs.mkdirSync(path.dirname(proxyRegistryPath), { recursive: true });
  fs.writeFileSync(proxyRegistryPath, JSON.stringify({
    proxies: shaders.map((shader) => ({
      id: shader.id,
      shaderId: shader.shaderId,
      sourceHash: shader.sourceHash,
      route: "hash-bound-exact-proxy",
      verified: true,
      frameCount: 1,
      browserAttempt: { compileSucceeded: true, drawSucceeded: true },
    })),
    failures: [],
  }));

  const catalog = loadVerifiedIsfCatalog({ manifestPath, runtimePath, proxyRegistryPath });
  const instances = shaders.map((shader, index) => ({
    id: `cue:${index}`,
    cueId: `cue:${index}`,
    visualizerId: shader.id,
    sourceHash: shader.sourceHash,
    execution: { route: "hash-bound-exact-proxy", status: "exact", drawable: true, silentDefault: false },
    proxy: { width: 160, height: 90, frameCount: 8, fps: 4, fidelityBoundary: "sampled pixels only" },
  }));
  const audit = auditHyperFramesShaderFidelity(instances, catalog);
  assert.equal(audit.ok, true);
  assert.equal(audit.instances.priorAtlasDowngrades, 3);
  assert.equal(audit.instances.imageInputInstances, 2);
  assert.equal(audit.instances.multipassInstances, 1);
  assert.equal(audit.instances.persistentInstances, 1);

  const packaged = promoteVerifiedIsfInstances(instances, catalog, audit, { width: 1920, height: 1080, fps: 30 });
  assert.equal(packaged.promoted, 3);
  assert.equal(Object.keys(packaged.sources).length, 3);
  assert.ok(instances.every((instance) => instance.execution.route === "deterministic-browser-isf"));
  assert.ok(instances.every((instance) => instance.proxy === null));
  assert.deepEqual(instances[1].liveIsf.imageInputs, ["inputImage"]);
  assert.equal(instances[2].liveIsf.persistent, true);
  assert.equal(instances[2].liveIsf.timelineRequirement, "sequential-from-cue-start");
});

test("source hash mismatch fails closed instead of retaining a sampled atlas", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hapa-isf-fidelity-mismatch-"));
  const manifestPath = path.join(root, "web/isf/manifest.json");
  const proxyRegistryPath = path.join(root, "web/isf/proxies/native-exact-proxies.json");
  const shaderPath = path.join(root, "web/isf/shaders/mismatch.fs");
  const runtimePath = path.join(root, "web/vendor/isf-renderer.js");
  fs.mkdirSync(path.dirname(shaderPath), { recursive: true });
  fs.mkdirSync(path.dirname(runtimePath), { recursive: true });
  fs.writeFileSync(shaderPath, "void main(){}\n");
  fs.writeFileSync(runtimePath, "runtime\n");
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify({
    shaders: [{
      id: "isf:mismatch",
      shaderId: "mismatch",
      title: "Mismatch",
      shaderType: "generator",
      source: "/static/isf/shaders/mismatch.fs",
      sourceHash: `sha256:${"f".repeat(64)}`,
      enabled: true,
      directorEligible: true,
      inputs: [],
    }],
  }));
  fs.mkdirSync(path.dirname(proxyRegistryPath), { recursive: true });
  fs.writeFileSync(proxyRegistryPath, JSON.stringify({
    proxies: [],
    failures: [{
      id: "isf:mismatch",
      shaderId: "mismatch",
      sourceHash: `sha256:${"f".repeat(64)}`,
      reason: "browser-isf-compile-or-draw-failed",
      failurePhase: "shader-compile",
    }],
  }));
  const catalog = loadVerifiedIsfCatalog({ manifestPath, runtimePath, proxyRegistryPath });
  const instances = [{
    id: "cue:mismatch",
    cueId: "cue:mismatch",
    visualizerId: "isf:mismatch",
    sourceHash: `sha256:${"f".repeat(64)}`,
    execution: { route: "hash-bound-exact-proxy", status: "exact", drawable: true, silentDefault: false },
    proxy: { width: 160, height: 90, frameCount: 8, fps: 4 },
  }];
  const audit = auditHyperFramesShaderFidelity(instances, catalog);
  assert.equal(audit.ok, false);
  promoteVerifiedIsfInstances(instances, catalog, audit, { width: 1920, height: 1080, fps: 30 });
  assert.equal(instances[0].execution.route, "unsupported");
  assert.equal(instances[0].execution.drawable, false);
  assert.equal(instances[0].proxy, null);
  assert.match(instances[0].execution.reason, /exact-isf-source-required/);
});
