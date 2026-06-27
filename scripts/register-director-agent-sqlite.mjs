import { exec } from "child_process";
import path from "path";

const dbPath = "/Users/calderwong/Desktop/hapa-agent-registry-node/storage/agent_registry.db";

const agentId = "agent_profile:hapa_music_video_director";
const name = "Hapa Music Video Director";
const now = Date.now();
const avatarName = "hapa_music_video_director";
const avatarStatus = "active";

const query = `INSERT OR REPLACE INTO agents (agent_id, name, created_at, updated_at, created_by, avatar_name, avatar_status) VALUES ('${agentId}', '${name}', ${now}, ${now}, 'operator', '${avatarName}', '${avatarStatus}');`;

console.log(`Registering Director Agent in SQLite database at: ${dbPath}...`);

exec(`sqlite3 "${dbPath}" "${query}"`, (err, stdout, stderr) => {
  if (err) {
    console.error("Failed to register agent in SQLite:", err);
    console.error(stderr);
    process.exit(1);
  }
  console.log("Hapa Music Video Director Agent registered successfully in SQLite registry.");
  if (stdout) console.log(stdout);
});
