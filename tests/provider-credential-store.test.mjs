import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createProviderCredentialStore } = require("../electron/provider-credential-store.cjs");

function fakeSafeStorage(available = true) {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (value) => Buffer.from(`sealed:${value}`, "utf8"),
    decryptString: (value) => value.toString("utf8").replace(/^sealed:/, ""),
  };
}

test("provider credential store encrypts locally and returns only redacted status", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "hapa-credential-store-"));
  const repositoryRoot = path.join(root, "repository");
  const userDataPath = path.join(root, "application-data");
  const store = createProviderCredentialStore({ repositoryRoot, userDataPath, safeStorage: fakeSafeStorage() });
  const secret = "test-provider-key-value-123456789";

  const saved = await store.save("openai", secret);
  const storagePath = path.join(userDataPath, "Secure Credentials", "provider-credentials.v1.json");
  const source = await readFile(storagePath, "utf8");
  const mode = (await stat(storagePath)).mode & 0o777;
  const status = await store.status();

  assert.equal(source.includes(secret), false);
  assert.equal(mode, 0o600);
  assert.equal(saved.configured, true);
  assert.match(saved.fingerprint, /^sha256:[a-f0-9]{12}$/);
  assert.equal(Object.hasOwn(saved, "apiKey"), false);
  assert.equal(Object.hasOwn(saved, "encrypted"), false);
  assert.equal(status.storage, "os-encrypted");
  assert.equal(status.providers.length, 3);
  assert.equal(await store.read("openai"), secret);
});

test("provider credential store replaces and removes provider entries independently", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "hapa-credential-lifecycle-"));
  const store = createProviderCredentialStore({
    repositoryRoot: path.join(root, "repository"),
    userDataPath: path.join(root, "application-data"),
    safeStorage: fakeSafeStorage(),
  });

  await store.save("fal", "test-fal-provider-key-one");
  const first = await store.status();
  await store.save("fal", "test-fal-provider-key-two");
  const second = await store.status();
  await store.remove("fal");
  const final = await store.status();

  assert.notEqual(first.providers[1].fingerprint, second.providers[1].fingerprint);
  assert.equal(final.providers[1].configured, false);
  assert.equal(await store.read("fal"), null);
});

test("provider credential store fails closed without OS encryption", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "hapa-credential-encryption-"));
  const store = createProviderCredentialStore({
    repositoryRoot: path.join(root, "repository"),
    userDataPath: path.join(root, "application-data"),
    safeStorage: fakeSafeStorage(false),
  });

  await assert.rejects(() => store.save("xai", "test-xai-provider-key"), { code: "encryption_unavailable" });
  await assert.rejects(() => store.status(), { code: "encryption_unavailable" });
});

test("provider credential store rejects repository-local storage and malformed input", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "hapa-credential-boundary-"));
  const repositoryRoot = path.join(root, "repository");

  assert.throws(() => createProviderCredentialStore({
    repositoryRoot,
    userDataPath: path.join(repositoryRoot, ".local"),
    safeStorage: fakeSafeStorage(),
  }), { code: "storage_boundary" });

  const store = createProviderCredentialStore({
    repositoryRoot,
    userDataPath: path.join(root, "application-data"),
    safeStorage: fakeSafeStorage(),
  });
  await assert.rejects(() => store.save("unknown", "test-provider-key-value"), { code: "invalid_provider" });
  await assert.rejects(() => store.save("openai", "short"), { code: "invalid_key" });
  await assert.rejects(() => store.save("openai", "test-provider\nkey-value"), { code: "invalid_key" });
});
