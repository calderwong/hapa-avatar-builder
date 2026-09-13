const crypto = require("node:crypto");
const path = require("node:path");
const fs = require("node:fs/promises");

const STORE_VERSION = 1;
const STORE_DIRECTORY = "Secure Credentials";
const STORE_FILENAME = "provider-credentials.v1.json";
const PROVIDERS = Object.freeze({
  openai: Object.freeze({ id: "openai", label: "OpenAI", envName: "OPENAI_API_KEY" }),
  fal: Object.freeze({ id: "fal", label: "FAL.com", envName: "FAL_KEY" }),
  xai: Object.freeze({ id: "xai", label: "xAI", envName: "XAI_API_KEY" }),
});

function credentialError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isPathInside(parentPath, candidatePath) {
  const relative = path.relative(path.resolve(parentPath), path.resolve(candidatePath));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

function validateProvider(providerId) {
  const normalized = String(providerId || "").trim().toLowerCase();
  if (!Object.hasOwn(PROVIDERS, normalized)) {
    throw credentialError("invalid_provider", "That API provider is not supported.");
  }
  return normalized;
}

function validateApiKey(apiKey) {
  if (typeof apiKey !== "string") {
    throw credentialError("invalid_key", "Enter an API key before saving.");
  }
  const normalized = apiKey.trim();
  if (normalized.length < 12 || normalized.length > 4096 || /[\r\n\0]/.test(normalized)) {
    throw credentialError("invalid_key", "API keys must be 12–4096 characters on one line.");
  }
  return normalized;
}

function fingerprint(apiKey) {
  return `sha256:${crypto.createHash("sha256").update(apiKey).digest("hex").slice(0, 12)}`;
}

function emptyDocument() {
  return { version: STORE_VERSION, providers: {} };
}

function createProviderCredentialStore({ userDataPath, repositoryRoot, safeStorage }) {
  if (!userDataPath || !repositoryRoot) {
    throw credentialError("storage_boundary", "A local application data path and repository root are required.");
  }
  const credentialDirectory = path.join(path.resolve(userDataPath), STORE_DIRECTORY);
  const storePath = path.join(credentialDirectory, STORE_FILENAME);
  if (isPathInside(repositoryRoot, credentialDirectory)) {
    throw credentialError("storage_boundary", "Credential storage must be outside the source repository.");
  }

  function assertEncryptionAvailable() {
    if (!safeStorage || typeof safeStorage.isEncryptionAvailable !== "function" || !safeStorage.isEncryptionAvailable()) {
      throw credentialError("encryption_unavailable", "Operating-system credential encryption is unavailable. No key was saved.");
    }
  }

  async function readDocument() {
    try {
      const source = await fs.readFile(storePath, "utf8");
      const parsed = JSON.parse(source);
      if (parsed?.version !== STORE_VERSION || !parsed.providers || typeof parsed.providers !== "object") {
        throw new Error("unsupported schema");
      }
      return parsed;
    } catch (error) {
      if (error?.code === "ENOENT") return emptyDocument();
      throw credentialError("store_unreadable", "The encrypted credential store could not be read.");
    }
  }

  async function writeDocument(document) {
    await fs.mkdir(credentialDirectory, { recursive: true, mode: 0o700 });
    await fs.chmod(credentialDirectory, 0o700);
    const temporaryPath = `${storePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
      await fs.rename(temporaryPath, storePath);
      await fs.chmod(storePath, 0o600);
    } finally {
      await fs.rm(temporaryPath, { force: true }).catch(() => {});
    }
  }

  function publicStatus(providerId, record) {
    const provider = PROVIDERS[providerId];
    return {
      id: provider.id,
      label: provider.label,
      envName: provider.envName,
      configured: Boolean(record?.encrypted),
      fingerprint: record?.fingerprint || "",
      updatedAt: record?.updatedAt || "",
    };
  }

  async function status() {
    assertEncryptionAvailable();
    const document = await readDocument();
    return {
      version: STORE_VERSION,
      storage: "os-encrypted",
      providers: Object.keys(PROVIDERS).map((providerId) => publicStatus(providerId, document.providers[providerId])),
    };
  }

  async function save(providerId, apiKey) {
    assertEncryptionAvailable();
    const id = validateProvider(providerId);
    const normalizedKey = validateApiKey(apiKey);
    const encrypted = safeStorage.encryptString(normalizedKey);
    if (!Buffer.isBuffer(encrypted) || encrypted.length === 0) {
      throw credentialError("encryption_failed", "The API key could not be encrypted. No key was saved.");
    }
    const document = await readDocument();
    document.providers[id] = {
      encrypted: encrypted.toString("base64"),
      fingerprint: fingerprint(normalizedKey),
      updatedAt: new Date().toISOString(),
    };
    await writeDocument(document);
    return publicStatus(id, document.providers[id]);
  }

  async function remove(providerId) {
    assertEncryptionAvailable();
    const id = validateProvider(providerId);
    const document = await readDocument();
    delete document.providers[id];
    await writeDocument(document);
    return publicStatus(id, null);
  }

  // Main-process adapters may use this later. It is intentionally never exposed through preload or IPC.
  async function read(providerId) {
    assertEncryptionAvailable();
    const id = validateProvider(providerId);
    const document = await readDocument();
    const encoded = document.providers[id]?.encrypted;
    if (!encoded) return null;
    try {
      return safeStorage.decryptString(Buffer.from(encoded, "base64"));
    } catch {
      throw credentialError("decryption_failed", "The saved API key could not be decrypted on this machine.");
    }
  }

  return Object.freeze({ status, save, remove, read });
}

module.exports = { PROVIDERS, createProviderCredentialStore };
