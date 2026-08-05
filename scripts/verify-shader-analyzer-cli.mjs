import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = join(repositoryRoot, "packages/shader-analyzer/dist/cli.js");
const workspace = mkdtempSync(join(tmpdir(), "galacean-shader-analyzer-"));
const blockedDirectory = join(workspace, "assets", "blocked");
let blockedDirectoryLocked = false;

try {
  assert.equal(readFileSync(cliPath, "utf8").split(/\r?\n/, 1)[0], "#!/usr/bin/env node");
  mkdirSync(join(workspace, "chunks"), { recursive: true });
  mkdirSync(blockedDirectory, { recursive: true });
  writeFileSync(join(workspace, "chunks", "common.custom"), "vec4 includedColor() { return vec4(1.0); }");
  writeFileSync(join(blockedDirectory, "unrelated.bin"), "not a shader include");

  const shaderPath = join(workspace, "main.shader");
  writeFileSync(
    shaderPath,
    `Shader "cli" {
  SubShader "Default" {
    Pass "p" {
      #include "chunks/common.custom"
      void vert() { gl_Position = vec4(0.0); }
      void frag() { gl_FragColor = includedColor(); }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}`
  );

  if (process.platform !== "win32") {
    chmodSync(blockedDirectory, 0o000);
    blockedDirectoryLocked = true;
  }
  const result = spawnSync(process.execPath, [cliPath, "--json", "--include-root", workspace, shaderPath], {
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual(JSON.parse(result.stdout).diagnostics, []);

  if (process.platform !== "win32") {
    assert.notEqual(statSync(cliPath).mode & 0o111, 0, "shader-analyzer CLI is not executable");
    const directResult = spawnSync(cliPath, ["--help"], { encoding: "utf8" });
    assert.equal(directResult.status, 0, directResult.error?.message || directResult.stderr || directResult.stdout);
  }
} finally {
  if (blockedDirectoryLocked) chmodSync(blockedDirectory, 0o700);
  rmSync(workspace, { recursive: true, force: true });
}

console.log("shader-analyzer CLI verified");
