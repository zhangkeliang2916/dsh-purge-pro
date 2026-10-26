import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { shimFileStatus } from "../lib/core.js";
import { hostFs } from "../lib/extract-asar.js";
import { registerCommandWithFallback } from "../lib/command-registration.js";
import { ensureAllProfileBodyInserts, profileHasPurgeBodyInsert } from "../lib/profile-insert.js";

const repo = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

test("text launchers remain text and fd operations are available", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "purge-shim-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const cmd = path.join(dir, "dsh.cmd");
  const binary = path.join(dir, "dsh.exe");
  fs.writeFileSync(cmd, "@echo off\r\n");
  fs.writeFileSync(binary, Buffer.from([0x4d, 0x5a, 0]));

  for (const name of ["openSync", "readSync", "closeSync", "fstatSync", "fsyncSync"]) {
    assert.equal(typeof hostFs[name], "function", `${name} is unavailable`);
  }
  assert.equal(shimFileStatus(cmd), "original");
  assert.equal(shimFileStatus(binary), "binary");
});

test("a duplicate slash command uses its fallback and does not block later commands", () => {
  const seen = [];
  const warnings = [];
  const commands = {
    register(spec) {
      if (spec.name === "purge" || spec.name === "skills") {
        throw new Error(`${spec.name} is already registered`);
      }
      seen.push(spec.name);
    },
  };
  const logger = { warn: (message) => warnings.push(message) };
  assert.equal(registerCommandWithFallback(commands, { name: "purge" }, ["purge-cmd"], logger), "purge-cmd");
  assert.equal(registerCommandWithFallback(commands, { name: "rules" }, ["purge-rules"], logger), "rules");
  assert.equal(registerCommandWithFallback(commands, { name: "skills" }, [], logger), null);
  assert.equal(registerCommandWithFallback(commands, { name: "rewind" }, ["purge-rewind"], logger), "rewind");
  assert.deepEqual(seen, ["purge-cmd", "rules", "rewind"]);
  assert.equal(warnings.length, 2);
  assert.throws(
    () => registerCommandWithFallback({ register() { throw new Error("disk failure"); } }, { name: "purge" }),
    /disk failure/,
  );
});

test("profile install adds one body insert and remains idempotent", (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "purge-profile-test-"));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const profile = path.join(home, "profiles", "desktop");
  const unrelated = path.join(home, "profiles", "other");
  fs.mkdirSync(profile, { recursive: true });
  fs.mkdirSync(unrelated, { recursive: true });
  fs.writeFileSync(path.join(profile, "package.json"), JSON.stringify({ name: "dsh-profile-desktop" }));
  fs.writeFileSync(path.join(unrelated, "package.json"), JSON.stringify({ name: "dsh-profile-other" }));
  fs.writeFileSync(path.join(profile, "cordis.patch.yml"), "- id: system-prompt\r\n  disabled: true\r\n");

  const run = () => spawnSync(process.execPath, [path.join(repo, "scripts", "ensure-profile-bundle.mjs")], {
    cwd: repo,
    env: { ...process.env, INIT_CWD: profile },
    encoding: "utf8",
  });
  for (let i = 0; i < 2; i += 1) {
    const result = run();
    assert.equal(result.status, 0, result.stderr);
  }

  const pkg = JSON.parse(fs.readFileSync(path.join(profile, "package.json"), "utf8"));
  assert.deepEqual(pkg.dsh.profile.bundles, ["dsh-purge"]);
  const patch = fs.readFileSync(path.join(profile, "cordis.patch.yml"), "utf8");
  assert.equal((patch.match(/^\s+- id: dsh-purge$/gm) ?? []).length, 1);
  assert.equal(profileHasPurgeBodyInsert(patch), true);
  assert.equal(patch.includes("\r\n"), true);
  assert.equal(ensureAllProfileBodyInserts(home)[0].wrote, false);
  assert.equal(fs.existsSync(path.join(unrelated, "cordis.patch.yml")), false);

  const bundledOverlay = fs.readFileSync(path.join(repo, "cordis.patch.yml"), "utf8");
  assert.equal(profileHasPurgeBodyInsert(bundledOverlay), false, "bundle overlay would queue a duplicate body");
  assert.match(bundledOverlay, /^- id: dsh-purge$/m);
});
