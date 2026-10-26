#!/usr/bin/env node
/** Register dsh-purge in a DSH profile when a package manager installs it. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureProfileBodyInsert, PURGE_NAME } from "../lib/profile-insert.js";

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { return null; }
}

function isProfile(pkg) {
  return !!pkg && (
    (typeof pkg.name === "string" && pkg.name.startsWith("dsh-profile-")) ||
    Array.isArray(pkg.dsh?.profile?.bundles)
  );
}

export function findProfileDir() {
  for (const seed of [process.env.INIT_CWD, process.env.npm_config_local_prefix, process.cwd()]) {
    if (!seed) continue;
    let dir = path.resolve(seed);
    for (let depth = 0; depth < 8; depth += 1) {
      if (isProfile(readJson(path.join(dir, "package.json")))) return dir;
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return "";
}

export function ensureProfileBundle(profileDir) {
  const file = path.join(profileDir, "package.json");
  const pkg = readJson(file);
  if (!isProfile(pkg)) throw new Error(`DSH profile package not found: ${file}`);
  pkg.dsh = pkg.dsh && typeof pkg.dsh === "object" ? pkg.dsh : {};
  pkg.dsh.profile = pkg.dsh.profile && typeof pkg.dsh.profile === "object" ? pkg.dsh.profile : {};
  const bundles = Array.isArray(pkg.dsh.profile.bundles) ? pkg.dsh.profile.bundles : [];
  if (!bundles.includes(PURGE_NAME)) {
    pkg.dsh.profile.bundles = [...bundles, PURGE_NAME];
    const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
    try {
      fs.writeFileSync(temp, JSON.stringify(pkg, null, 2) + "\n", "utf8");
      fs.renameSync(temp, file);
    } catch (error) {
      try { fs.unlinkSync(temp); } catch { /* no temp left */ }
      throw error;
    }
  }
  return ensureProfileBodyInsert(profileDir);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const profileDir = findProfileDir();
    if (profileDir) {
      const result = ensureProfileBundle(profileDir);
      process.stdout.write(`dsh-purge: profile body ${result.wrote ? "inserted" : "already present"} (${profileDir})\n`);
    }
  } catch (error) {
    process.stderr.write(`dsh-purge: profile registration failed: ${error?.message ?? error}\n`);
    process.exitCode = 1;
  }
}
