import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as pc from "../lib/redteam/platform-config.js";

let pass = 0;
const check = async (name, fn) => {
  try { await fn(); console.log("✓", name); pass += 1 }
  catch (e) { console.log("✗", name); console.log("  ", e.message); process.exitCode = 1 }
};

const root = fs.mkdtempSync(path.join(os.tmpdir(), "rt-cfg-"));
const bin = path.join(root, "nmap");
fs.writeFileSync(bin, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
const noexec = path.join(root, "noexec");
fs.writeFileSync(noexec, "#!/bin/sh\n", { mode: 0o644 });
const py = path.join(root, "httpx");
fs.writeFileSync(py, "#!/usr/bin/env python3\nprint(1)\n", { mode: 0o755 });

await check("recon pipeline's naabu is in the environment catalog", () => {
  assert.ok(pc.TOOL_CATALOG.some((tool) => tool.id === "naabu"));
});

await check("config rejects directory / non-executable", () => {
  pc.savePlatformConfig({ tools: { nmap: root }, envAdaptSkip: false }, root + "/dir");
  assert.equal(pc.resolveTool("nmap", { root: root + "/dir" }).path, null);
  pc.savePlatformConfig({ tools: { nmap: noexec }, envAdaptSkip: false }, root + "/nx");
  // Windows ignores POSIX mode bits in X_OK checks.
  if (process.platform !== "win32") {
    assert.equal(pc.resolveTool("nmap", { root: root + "/nx" }).path, null);
  }
});

await check("config rejects Python httpx", () => {
  pc.savePlatformConfig({ tools: { httpx: py } }, root + "/py");
  assert.equal(pc.resolveTool("httpx", { root: root + "/py" }).path, null);
});

await check("PATH rejects Windows Python httpx launcher", () => {
  const scripts = path.join(root, "Python311", "Scripts");
  fs.mkdirSync(scripts, { recursive: true });
  fs.writeFileSync(path.join(scripts, "httpx.exe"),
    Buffer.from("MZ" + "\0".repeat(128) + "python.exe\0PK__main__.py", "latin1"),
    { mode: 0o755 });
  assert.equal(pc.resolveTool("httpx", {
    root: root + "/win-py", env: { PATH: scripts },
  }).path, null);
});

await check("executable absolute path resolves", () => {
  pc.savePlatformConfig({ tools: { nmap: bin } }, root + "/ok");
  const t = pc.resolveTool("nmap", { root: root + "/ok" });
  assert.equal(t.path, bin);
  assert.equal(t.source, "config");
});

await check("config file is 0600", () => {
  pc.savePlatformConfig({ notes: "x" }, root + "/perm");
  const st = fs.statSync(path.join(root + "/perm", "config.json"));
  if (process.platform !== "win32") assert.equal(st.mode & 0o777, 0o600);
  else assert.ok(st.isFile());
});

await check("empty env does not clobber, clearEnv does", () => {
  const r = root + "/env";
  pc.savePlatformConfig({ env: { FOFA_KEY: "secret-a" } }, r);
  pc.savePlatformConfig({ env: { FOFA_KEY: "" } }, r);
  assert.equal(pc.loadPlatformConfig(r).env.FOFA_KEY, "secret-a");
  pc.savePlatformConfig({ clearEnv: ["FOFA_KEY"] }, r);
  assert.equal(pc.loadPlatformConfig(r).env.FOFA_KEY, "");
});

await check("summary masks secrets", () => {
  const r = root + "/mask";
  pc.savePlatformConfig({ env: { FOFA_KEY: "secret-b" } }, r);
  const s = pc.platformSummary(r);
  assert.equal(s.config.env.FOFA_KEY, "");
  assert.equal(s.config.envPresent.FOFA_KEY, true);
});

await check("stale saved path is not ready", () => {
  const r = root + "/stale";
  pc.savePlatformConfig({ tools: { nmap: path.join(root, "gone") }, envAdaptSkip: false }, r);
  const s = pc.envAdaptStatus(r);
  assert.equal(s.ready, false);
  assert.equal(s.reason, "need-config");
});

await check("resolved config path is ready/configured", () => {
  const r = root + "/ready";
  pc.savePlatformConfig({ tools: { nmap: bin }, envAdaptSkip: false }, r);
  const s = pc.envAdaptStatus(r);
  assert.equal(s.ready, true);
  assert.equal(s.reason, "configured");
  assert.ok(s.foundIds.includes("nmap"));
});

await check("skip wins over stale paths but reports them", () => {
  const r = root + "/skip";
  pc.savePlatformConfig({ tools: { nmap: path.join(root, "gone2") }, envAdaptSkip: true }, r);
  const s = pc.envAdaptStatus(r);
  assert.equal(s.reason, "skipped");
  assert.equal(s.ready, true);
  assert.equal(s.configuredPathsSaved, true);
  assert.equal(s.configured, false);
  assert.match(s.message, /解析不到/);
});

await check("valid config beats skip", () => {
  const r = root + "/both";
  pc.savePlatformConfig({ tools: { nmap: bin }, envAdaptSkip: true }, r);
  const s = pc.envAdaptStatus(r);
  assert.equal(s.reason, "configured");
  assert.equal(s.configured, true);
});

fs.rmSync(root, { recursive: true, force: true });
console.log(pass, "checks passed");
