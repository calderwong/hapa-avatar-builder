import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { echoLocalMediaApiBase } from "../src/domain/echo-audio-route.js";
import { localFileApiUri } from "../src/domain/local-media-uri.js";

test("Echo media stays on the selected static Builder while explicit Electron/Vite services retain precedence", () => {
  assert.equal(echoLocalMediaApiBase("", { protocol: "http:", origin: "http://127.0.0.1:18998" }), "http://127.0.0.1:18998");
  assert.equal(echoLocalMediaApiBase("", { protocol: "https:", origin: "https://builder.local:8798" }), "https://builder.local:8798");
  assert.equal(echoLocalMediaApiBase("http://127.0.0.1:8787/", { protocol: "http:", origin: "http://localhost:5178" }), "http://127.0.0.1:8787");
  assert.equal(echoLocalMediaApiBase("http://127.0.0.1:8797", { protocol: "file:", origin: "null" }), "http://127.0.0.1:8797");
  assert.equal(echoLocalMediaApiBase("", { protocol: "file:", origin: "null" }), "http://127.0.0.1:8787");
});

test("App registry lists and local media use its selected static API, preserving explicit routes", () => {
  const source=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
  const functions=source.slice(source.indexOf('function resolveMediaUri(uri)'),source.indexOf('const FALLBACK_AVATARS ='));
  const evaluate=(apiBase,location)=>vm.runInNewContext(`${functions}\n({resolveMediaUri,resolveSongRegistryUri})`,{
    API_BASE:apiBase,SONG_REGISTRY_API_BASE:'http://127.0.0.1:8798',location,
    echoLocalMediaApiBase,localFileApiUri,
  });
  const staticApp=evaluate('',{protocol:'http:',origin:'http://127.0.0.1:19088'});
  assert.equal(staticApp.resolveSongRegistryUri('/api/song-registry/dear-papa?limit=500'),'http://127.0.0.1:19088/api/song-registry/dear-papa?limit=500');
  assert.equal(staticApp.resolveMediaUri('/media/comic-song/dear-papa/page-01.png'),'http://127.0.0.1:19088/media/comic-song/dear-papa/page-01.png');
  assert.equal(staticApp.resolveSongRegistryUri('https://registry.example/audio/song'),'https://registry.example/audio/song');
  assert.equal(staticApp.resolveSongRegistryUri('/api/tracks'),'http://127.0.0.1:8798/api/tracks');
  const explicit=evaluate('http://127.0.0.1:8797',{protocol:'file:',origin:'null'});
  assert.equal(explicit.resolveSongRegistryUri('/api/song-registry/audio/song'),'http://127.0.0.1:8797/api/song-registry/audio/song');
});
