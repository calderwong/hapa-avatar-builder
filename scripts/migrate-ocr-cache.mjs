import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CACHE_DIR = path.join(ROOT, "data", "tarot-ocr-refresh", "ocr-cache");

function hash(value = "") {
  return crypto.createHash("sha1").update(String(value)).digest("hex").slice(0, 16);
}

async function migrate() {
  try {
    const files = await fs.readdir(CACHE_DIR);
    let migrated = 0;
    let alreadyNormalized = 0;
    let skipped = 0;

    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const filePath = path.join(CACHE_DIR, file);
      try {
        const content = JSON.parse(await fs.readFile(filePath, "utf8"));
        const originalPath = content.path;
        if (!originalPath) {
          skipped++;
          continue;
        }

        // Determine the relative path
        let relativePath = "";
        if (originalPath.startsWith(ROOT)) {
          relativePath = path.relative(ROOT, originalPath);
        } else {
          const parts = originalPath.split("hapa-avatar-builder/");
          if (parts.length > 1) {
            relativePath = parts[parts.length - 1];
          } else {
            const idx = originalPath.indexOf("data/");
            if (idx !== -1) {
              relativePath = originalPath.substring(idx);
            }
          }
        }

        if (!relativePath) {
          skipped++;
          continue;
        }

        const newHash = hash(relativePath);
        const newFilename = `${newHash}.json`;
        const newFilePath = path.join(CACHE_DIR, newFilename);

        // Update the path in the JSON to the current absolute path
        const currentAbsolutePath = path.join(ROOT, relativePath);
        content.path = currentAbsolutePath;

        if (newFilename !== file) {
          await fs.writeFile(newFilePath, JSON.stringify(content, null, 2) + "\n");
          // Only delete the old file if it doesn't collide with a new hash we just wrote or need
          if (filePath !== newFilePath) {
            await fs.unlink(filePath);
          }
          migrated++;
        } else {
          await fs.writeFile(filePath, JSON.stringify(content, null, 2) + "\n");
          alreadyNormalized++;
        }
      } catch (e) {
        console.error(`Error processing ${file}:`, e);
      }
    }
    console.log(`Migration complete. Migrated: ${migrated}, Already correct: ${alreadyNormalized}, Skipped: ${skipped}`);
  } catch (e) {
    console.error("Migration failed:", e);
  }
}

migrate();
