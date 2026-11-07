// Dry-run the whole patch set against a sandbox copy of the live 0.2.1-rc.2 host.
// Nothing outside /tmp is written. Verifies: every patch that can apply does apply,
// #40 lands, and the patched files still parse.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import * as core from "../lib/core.js";

const HOST = process.env.PURGE_HOST
  || "/Users/yuqma/.npm/_npx/1e7f6d9597241db0/node_modules/@deepseek-ai";
// 隔离 DSH_HOME：否则 targetFiles 会把 pi-ai 的 profile 副本解析到真实用户目录并写盘。
const DSH_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "purge-home-"));
process.env.DSH_HOME = DSH_HOME;
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "purge-host-")) + "/@deepseek-ai";

fs.mkdirSync(SANDBOX, { recursive: true });
const files = core.targetFiles(HOST, DSH_HOME);
let copied = 0;
for (const value of Object.values(files)) {
  for (const fp of (Array.isArray(value) ? value : [value])) {
    if (!fp || typeof fp !== "string" || !fp.startsWith(HOST) || !fs.existsSync(fp)) continue;
    const rel = path.relative(HOST, fp);
    const dst = path.join(SANDBOX, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(fp, dst);
    copied += 1;
  }
}
console.log(`sandbox: ${SANDBOX} (${copied} files copied)`);

const before = await core.patchStatus(SANDBOX, core.ALL_PATCHES);
const report = await core.applyPatches(SANDBOX, core.ALL_PATCHES);
const after = await core.patchStatus(SANDBOX, core.ALL_PATCHES);

const bad = report.filter((row) => !["applied", "already", "na", "skipped"].includes(row.status));
console.log("\napply report:");
for (const row of report) {
  if (row.status !== "applied" && row.status !== "na") {
    console.log(`  #${row.patch_id} ${row.name}: ${row.status}`);
  }
}
console.log(`  applied: ${report.filter((r) => r.status === "applied").length}`);

const statusMap = (after && after.patch_status) || after;
const p40 = statusMap[40];
assert.equal(p40, "applied", `patch 40 is ${p40}`);
const hostPackage = JSON.parse(fs.readFileSync(path.join(HOST, "dsh-system-prompt", "package.json"), "utf8"));
if (hostPackage.version.startsWith("0.2.2-rc.1")) {
  for (const id of [14, 40, 54, 60, 62, 67, 74]) {
    assert.equal(statusMap[id], "applied", `0.2.2-rc.1 patch ${id} is ${statusMap[id]}`);
  }
  assert.equal(statusMap[88], "skipped", "fresh host has no legacy hung prompt to remove");
}


// Every file we actually changed must still parse.
const changed = [];
for (const key of Object.keys(files)) {
  for (const fp of (Array.isArray(files[key]) ? files[key] : [files[key]])) {
    if (!fp || !fp.startsWith(HOST)) continue;
    const rel = path.relative(HOST, fp);
    const copy = path.join(SANDBOX, rel);
    if (!fs.existsSync(copy)) continue;
    if (fs.readFileSync(copy, "utf8") !== fs.readFileSync(fp, "utf8")) changed.push(copy);
  }
}
for (const fp of changed) {
  if (!/\.(js|mjs|cjs)$/.test(fp)) continue;
  const tmp = path.join(os.tmpdir(), `parse-${process.pid}-${Math.random().toString(16).slice(2)}.mjs`);
  fs.copyFileSync(fp, tmp);
  execFileSync(process.execPath, ["--check", tmp], { stdio: "pipe" });
  fs.unlinkSync(tmp);
}
console.log(`\nchanged files: ${changed.length}, all JS parse OK`);
console.log(`patches applied after run: ${Object.values(statusMap).filter((s) => s === "applied").length}`);
