/** Keep the main plugin queued in profiles that own dsh-purge. */
import fs from "node:fs";
import path from "node:path";

export const PURGE_NAME = "dsh-purge";

const BODY_INSERT = [
  "- insert:",
  "    - id: dsh-purge",
  "      name: dsh-purge",
  "      inject: [systemPrompt, tools]",
  "      config:",
  "        enabled: true",
  "        stripMnemon: true",
  "        capabilityProtocol: true",
  "        hooksDenyBypass: true",
  "",
].join("\n");

export function profileHasPurgeBodyInsert(source) {
  let insertIndent = -1;
  for (const line of String(source ?? "").split(/\r?\n/)) {
    const indent = line.match(/^[ \t]*/)[0].length;
    const trimmed = line.trim();
    if (/^-\s*insert:\s*$/.test(trimmed)) {
      insertIndent = indent;
      continue;
    }
    if (insertIndent < 0) continue;
    if (trimmed && indent <= insertIndent && /^-\s/.test(trimmed)) {
      insertIndent = -1;
      continue;
    }
    if (/^-\s*id:\s*['"]?dsh-purge(?:-main)?['"]?\s*$/.test(trimmed)) return true;
    if (/^(?:-\s*)?name:\s*['"]?dsh-purge['"]?\s*$/.test(trimmed)) return true;
  }
  return false;
}

function readIfPresent(file) {
  try { return fs.readFileSync(file, "utf8"); }
  catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
}

export function ensureProfileBodyInsert(profileDir) {
  const file = path.join(profileDir, "cordis.patch.yml");
  const source = readIfPresent(file);
  if (profileHasPurgeBodyInsert(source)) return { ok: true, wrote: false, path: file };

  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const prefix = source ? (source.endsWith("\n") ? newline : newline + newline) : "";
  const next = source + prefix + BODY_INSERT.replace(/\n/g, newline);
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(temp, next, "utf8");
    fs.renameSync(temp, file);
  } catch (error) {
    try { fs.unlinkSync(temp); } catch { /* no temp left */ }
    throw error;
  }
  return { ok: true, wrote: true, path: file };
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { return null; }
}

function ownsPurge(profileDir) {
  const profile = readJson(path.join(profileDir, "package.json"));
  if (profile?.dsh?.profile?.bundles?.includes?.(PURGE_NAME)) return true;
  return fs.existsSync(path.join(profileDir, "node_modules", PURGE_NAME, "package.json"));
}

export function ensureAllProfileBodyInserts(dshHome) {
  const root = path.join(dshHome, "profiles");
  let profiles;
  try { profiles = fs.readdirSync(root, { withFileTypes: true }); }
  catch { return []; }
  const results = [];
  for (const entry of profiles) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(root, entry.name);
    if (!ownsPurge(dir)) continue;
    try { results.push({ dir, ...ensureProfileBodyInsert(dir) }); }
    catch (error) {
      results.push({ dir, ok: false, wrote: false, error: String(error?.message ?? error) });
    }
  }
  return results;
}
