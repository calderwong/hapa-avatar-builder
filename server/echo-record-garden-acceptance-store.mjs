import { createHash, randomBytes } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { link, lstat, mkdir, open, unlink } from "node:fs/promises";
import path from "node:path";
import { buildEchoRecordGardenAcceptanceReceipt } from "../src/domain/echo-record-garden-acceptance.js";

export const ECHO_RECORD_GARDEN_ACCEPTANCE_DIRECTORY = "artifacts/echo-record-garden/operator-acceptance";
export const ECHO_RECORD_GARDEN_ACCEPTANCE_INTEGRITY_SCHEMA = "hapa.echo-record-garden.acceptance-integrity.v1";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function compactTimestamp(value = "") {
  const parsed = Date.parse(String(value || ""));
  const date = Number.isFinite(parsed) ? new Date(parsed) : new Date();
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item) ?? "null").join(",")}]`;
  if (value && typeof value === "object") {
    const entries = [];
    for (const key of Object.keys(value).sort()) {
      const encoded = stableJson(value[key]);
      if (encoded !== undefined) entries.push(`${JSON.stringify(key)}:${encoded}`);
    }
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

function canonicalObservation(receipt) {
  const canonical = structuredClone(receipt);
  delete canonical.integrity;
  delete canonical.receivedAt;
  if (canonical.service) delete canonical.service.capturedAt;
  if (canonical.revision?.end) delete canonical.revision.end.capturedAt;
  return stableJson(canonical);
}

function receiptObservationKey(receipt) {
  return sha256(canonicalObservation(receipt));
}

function sameObservation(left, right) {
  return receiptObservationKey(left) === receiptObservationKey(right);
}

function persistedContentKey(receipt) {
  const canonical = structuredClone(receipt);
  if (canonical.integrity) delete canonical.integrity.persistedContentSha256;
  return sha256(stableJson(canonical));
}

function sealReceipt(receipt) {
  const sealed = {
    ...receipt,
    integrity: {
      schemaVersion: ECHO_RECORD_GARDEN_ACCEPTANCE_INTEGRITY_SCHEMA,
      algorithm: "sha256",
      observationSha256: `sha256:${receiptObservationKey(receipt)}`,
    },
  };
  return {
    ...sealed,
    integrity: {
      ...sealed.integrity,
      persistedContentSha256: `sha256:${persistedContentKey(sealed)}`,
    },
  };
}

function receiptStoreError(code, message, statusCode = 409) {
  return Object.assign(new Error(message), { code, statusCode });
}

function verifyReceiptIntegrity(receipt) {
  const integrity = receipt?.integrity;
  const fields = integrity && typeof integrity === "object" && !Array.isArray(integrity)
    ? Object.keys(integrity).sort()
    : [];
  const expectedFields = ["algorithm", "observationSha256", "persistedContentSha256", "schemaVersion"];
  if (
    !receipt || typeof receipt !== "object" || Array.isArray(receipt)
    || integrity?.schemaVersion !== ECHO_RECORD_GARDEN_ACCEPTANCE_INTEGRITY_SCHEMA
    || integrity?.algorithm !== "sha256"
    || JSON.stringify(fields) !== JSON.stringify(expectedFields)
    || !/^sha256:[a-f0-9]{64}$/.test(String(integrity?.observationSha256 || ""))
    || !/^sha256:[a-f0-9]{64}$/.test(String(integrity?.persistedContentSha256 || ""))
    || integrity.observationSha256 !== `sha256:${receiptObservationKey(receipt)}`
    || integrity.persistedContentSha256 !== `sha256:${persistedContentKey(receipt)}`
  ) {
    throw receiptStoreError(
      "acceptance_receipt_integrity_invalid",
      "The existing acceptance receipt failed its embedded integrity check.",
    );
  }
  return receipt;
}

function sameFileIdentity(left, right) {
  return left?.isFile?.()
    && right?.isFile?.()
    && left.dev === right.dev
    && left.ino === right.ino;
}

async function readExistingReceipt(receiptPath) {
  let before;
  try {
    before = await lstat(receiptPath);
  } catch {
    throw receiptStoreError(
      "acceptance_receipt_path_invalid",
      "The existing acceptance receipt path could not be inspected safely.",
    );
  }
  if (before.isSymbolicLink() || !before.isFile()) {
    throw receiptStoreError(
      "acceptance_receipt_path_invalid",
      "The existing acceptance receipt path must be a regular, non-symlink file.",
    );
  }
  let handle;
  try {
    handle = await open(receiptPath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW || 0));
    const opened = await handle.stat();
    if (!sameFileIdentity(before, opened)) {
      throw receiptStoreError(
        "acceptance_receipt_path_invalid",
        "The existing acceptance receipt changed while it was being opened.",
      );
    }
    const bytes = await handle.readFile();
    const after = await lstat(receiptPath);
    if (after.isSymbolicLink() || !sameFileIdentity(opened, after)) {
      throw receiptStoreError(
        "acceptance_receipt_path_invalid",
        "The existing acceptance receipt changed while it was being read.",
      );
    }
    return bytes;
  } catch (error) {
    if (error?.code === "acceptance_receipt_path_invalid") throw error;
    throw receiptStoreError(
      "acceptance_receipt_path_invalid",
      "The existing acceptance receipt could not be opened safely.",
    );
  } finally {
    await handle?.close().catch(() => {});
  }
}

async function syncDirectory(directory) {
  let handle;
  try {
    handle = await open(directory, "r");
    await handle.sync();
  } finally {
    await handle?.close();
  }
}

export async function saveEchoRecordGardenAcceptanceReceipt({
  root,
  input = {},
  service = {},
  receivedAt = new Date().toISOString(),
} = {}) {
  if (!root) throw new TypeError("A Record Garden receipt root is required.");
  const receipt = sealReceipt(buildEchoRecordGardenAcceptanceReceipt({
    draft: input.draft,
    diagnostics: input.diagnostics,
    service,
    contextStart: input.contextStart,
    contextEnd: input.contextEnd,
    browserDeliveryStart: input.browserDeliveryStart,
    browserDeliveryEnd: input.browserDeliveryEnd,
    browserLoadedChunkStart: input.browserLoadedChunkStart,
    browserLoadedChunkEnd: input.browserLoadedChunkEnd,
    environmentSessions: input.environmentSessions,
    checkpoints: input.checkpoints,
    result: input.result,
    receivedAt,
  }));
  const directory = path.resolve(root, ECHO_RECORD_GARDEN_ACCEPTANCE_DIRECTORY);
  const observationKey = receiptObservationKey(receipt);
  const fileName = `record-garden-${receipt.result}-${compactTimestamp(receipt.operatorAttestation.observedAt)}-${observationKey}.json`;
  const receiptPath = path.join(directory, fileName);
  const relativePath = path.relative(path.resolve(root), receiptPath);
  if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw Object.assign(new Error("Acceptance receipt path escaped the configured root."), {
      code: "acceptance_path_invalid",
      statusCode: 500,
    });
  }
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const bytes = `${JSON.stringify(receipt, null, 2)}\n`;
  const temporaryPath = path.join(directory, `.${fileName}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`);
  let temporaryHandle;
  try {
    temporaryHandle = await open(temporaryPath, "wx", 0o600);
    await temporaryHandle.writeFile(bytes, { encoding: "utf8" });
    await temporaryHandle.sync();
    await temporaryHandle.close();
    temporaryHandle = null;
    await link(temporaryPath, receiptPath);
    await unlink(temporaryPath);
    await syncDirectory(directory);
  } catch (error) {
    await temporaryHandle?.close().catch(() => {});
    await unlink(temporaryPath).catch(() => {});
    if (error?.code !== "EEXIST") throw error;
    const existingBytes = await readExistingReceipt(receiptPath);
    let existing;
    try {
      existing = JSON.parse(existingBytes.toString("utf8"));
    } catch {
      throw receiptStoreError(
        "acceptance_receipt_integrity_invalid",
        "The existing acceptance receipt is not valid JSON.",
      );
    }
    if (!sameObservation(existing, receipt)) {
      throw Object.assign(new Error("An acceptance receipt already exists for a different observation."), {
        code: "acceptance_receipt_conflict",
        statusCode: 409,
      });
    }
    verifyReceiptIntegrity(existing);
    return {
      receipt: existing,
      receiptPath,
      relativePath,
      sha256: sha256(existingBytes),
      idempotentReplay: true,
    };
  }
  return {
    receipt,
    receiptPath,
    relativePath,
    sha256: sha256(bytes),
    idempotentReplay: false,
  };
}
