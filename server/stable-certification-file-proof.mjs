import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const SHA256 = /^sha256:[a-f0-9]{64}$/u;
const DEFAULT_DIGEST_CACHE_LIMIT = 32;
const stableCertificationDigestCache = new Map();

function statIdentity(value) {
  return [
    String(value.dev),
    String(value.ino),
    String(value.size),
    String(value.mtimeNs),
    String(value.ctimeNs),
  ].join(":");
}

function pathObjectIdentity(value) {
  return `${String(value.dev)}:${String(value.ino)}`;
}

function proofError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function inspectCertificationFile(filePath, label) {
  const resolvedPath = path.resolve(filePath);
  let pathBefore;
  try {
    pathBefore = fs.lstatSync(resolvedPath, { bigint: true });
  } catch (error) {
    throw proofError("CERTIFICATION_FILE_UNREADABLE", `${label} could not be inspected: ${error.message}`);
  }
  if (pathBefore.isSymbolicLink()) {
    throw proofError("CERTIFICATION_FILE_SYMLINK", `${label} may not be a symbolic link.`);
  }
  if (!pathBefore.isFile() || pathBefore.size <= 0n) {
    throw proofError("CERTIFICATION_FILE_NOT_REGULAR", `${label} is not a non-empty regular file.`);
  }

  const flags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0);
  let descriptor;
  try {
    descriptor = fs.openSync(resolvedPath, flags);
  } catch (error) {
    const code = error?.code === "ELOOP" ? "CERTIFICATION_FILE_SYMLINK" : "CERTIFICATION_FILE_UNREADABLE";
    throw proofError(code, `${label} could not be opened without following links: ${error.message}`);
  }
  try {
    const descriptorBefore = fs.fstatSync(descriptor, { bigint: true });
    if (!descriptorBefore.isFile() || descriptorBefore.size <= 0n) {
      throw proofError("CERTIFICATION_FILE_NOT_REGULAR", `${label} is not a non-empty regular file.`);
    }
    if (pathObjectIdentity(pathBefore) !== pathObjectIdentity(descriptorBefore)) {
      throw proofError("CERTIFICATION_FILE_PATH_REPLACED", `${label} was replaced while it was being opened.`);
    }
    return {
      descriptor,
      resolvedPath,
      realPathBefore: fs.realpathSync(resolvedPath),
      descriptorBefore,
    };
  } catch (error) {
    fs.closeSync(descriptor);
    throw error;
  }
}

function finishCertificationFileInspection(inspection, label) {
  const descriptorAfter = fs.fstatSync(inspection.descriptor, { bigint: true });
  let pathAfter;
  let realPathAfter;
  try {
    pathAfter = fs.lstatSync(inspection.resolvedPath, { bigint: true });
    realPathAfter = fs.realpathSync(inspection.resolvedPath);
  } catch (error) {
    throw proofError("CERTIFICATION_FILE_PATH_REPLACED", `${label} path changed while it was being certified: ${error.message}`);
  }
  if (pathAfter.isSymbolicLink()) {
    throw proofError("CERTIFICATION_FILE_SYMLINK", `${label} became a symbolic link while it was being certified.`);
  }
  if (
    pathObjectIdentity(descriptorAfter) !== pathObjectIdentity(pathAfter)
    || inspection.realPathBefore !== realPathAfter
  ) {
    throw proofError("CERTIFICATION_FILE_PATH_REPLACED", `${label} path identity changed while it was being certified.`);
  }
  if (statIdentity(inspection.descriptorBefore) !== statIdentity(descriptorAfter)) {
    throw proofError("CERTIFICATION_FILE_CHANGED_DURING_READ", `${label} bytes changed while they were being certified.`);
  }
  if (statIdentity(descriptorAfter) !== statIdentity(pathAfter)) {
    throw proofError("CERTIFICATION_FILE_PATH_REPLACED", `${label} path metadata changed while it was being certified.`);
  }
  return {
    realPath: realPathAfter,
    statIdentity: statIdentity(descriptorAfter),
  };
}

function digestCacheKey(inspection) {
  return [
    inspection.resolvedPath,
    inspection.realPathBefore,
    statIdentity(inspection.descriptorBefore),
  ].join("\u0000");
}

function rememberDigest(cache, key, sha256, limit) {
  if (!cache || typeof cache.set !== "function") return;
  if (typeof cache.delete === "function") cache.delete(key);
  cache.set(key, sha256);
  const boundedLimit = Math.max(1, Math.min(1_024, Math.floor(Number(limit) || DEFAULT_DIGEST_CACHE_LIMIT)));
  while (Number(cache.size) > boundedLimit) {
    const oldestKey = cache.keys?.().next?.().value;
    if (oldestKey === undefined || typeof cache.delete !== "function") break;
    cache.delete(oldestKey);
  }
}

function hashDescriptorSha256(descriptor) {
  const hash = createHash("sha256");
  const chunk = Buffer.allocUnsafe(1024 * 1024);
  let position = 0;
  while (true) {
    const bytesRead = fs.readSync(descriptor, chunk, 0, chunk.byteLength, position);
    if (!bytesRead) break;
    hash.update(chunk.subarray(0, bytesRead));
    position += bytesRead;
  }
  return `sha256:${hash.digest("hex")}`;
}

/**
 * Return the raw-byte SHA for a stable file snapshot. Unchanged files reuse a
 * bounded digest cache, but every hit is still reopened with O_NOFOLLOW and
 * receives the complete descriptor/path/realpath proof before it is trusted.
 */
export function stableCertificationFileSha256(filePath, {
  label = "Certification input",
  cache = stableCertificationDigestCache,
  cacheLimit = DEFAULT_DIGEST_CACHE_LIMIT,
  readDescriptor = null,
} = {}) {
  const inspection = inspectCertificationFile(filePath, label);
  try {
    const key = digestCacheKey(inspection);
    const cachedSha256 = cache && typeof cache.get === "function" ? cache.get(key) : null;
    if (SHA256.test(String(cachedSha256 || ""))) {
      finishCertificationFileInspection(inspection, label);
      rememberDigest(cache, key, cachedSha256, cacheLimit);
      return cachedSha256;
    }
    let sha256;
    if (typeof readDescriptor === "function") {
      const bytes = readDescriptor(inspection.descriptor);
      if (!Buffer.isBuffer(bytes)) {
        throw proofError("CERTIFICATION_FILE_READ_INVALID", `${label} did not produce a byte buffer.`);
      }
      sha256 = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
    } else {
      sha256 = hashDescriptorSha256(inspection.descriptor);
    }
    finishCertificationFileInspection(inspection, label);
    rememberDigest(cache, key, sha256, cacheLimit);
    return sha256;
  } finally {
    fs.closeSync(inspection.descriptor);
  }
}

/**
 * Hash one stable regular-file snapshot without following a final-component
 * symlink. The returned SHA remains the raw-byte SHA used by existing Echo
 * certificates; stat/path identities are race guards, not hash material.
 * readDescriptor is injectable only so race regressions can deterministically
 * replace the path between the descriptor read and the final path proof.
 */
export function stableCertificationFileProof(filePath, {
  label = "Certification input",
  readDescriptor = (descriptor) => fs.readFileSync(descriptor),
} = {}) {
  const inspection = inspectCertificationFile(filePath, label);
  try {
    const bytes = readDescriptor(inspection.descriptor);
    if (!Buffer.isBuffer(bytes)) {
      throw proofError("CERTIFICATION_FILE_READ_INVALID", `${label} did not produce a byte buffer.`);
    }
    const finalInspection = finishCertificationFileInspection(inspection, label);
    return Object.freeze({
      path: inspection.resolvedPath,
      realPath: finalInspection.realPath,
      statIdentity: finalInspection.statIdentity,
      sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      bytes,
    });
  } finally {
    fs.closeSync(inspection.descriptor);
  }
}
