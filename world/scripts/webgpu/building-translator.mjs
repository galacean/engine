import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

// Native masonry shaders contain recovered GLSL control flow and matrix IO. Use
// the same engine reflection and uniform layout, with glslang / Tint as the stage translator.
export async function buildingTranslator(tools, scratch) {
  for (const [name, digest] of [
    ["twgsl.cjs", "b4f1f66263b801210f955f74aa71f1939be647ce0fd80ea5befd12a78499d5ff"],
    ["twgsl.wasm", "a434c2decdbb38caadf5f486d806384a1543554828c983c77922b2d92579914c"]
  ]) {
    assert.equal(
      createHash("sha256")
        .update(fs.readFileSync(path.join(tools, name)))
        .digest("hex"),
      digest,
      name
    );
  }
  const glslang = path.join(tools, process.platform === "win32" ? "glslang.exe" : "glslang");
  assert.match(execFileSync(glslang, ["--version"], { encoding: "utf8" }), /Glslang Version: [^\n]*\b16\.6\.0\b/);
  const tint = await createRequire(import.meta.url)(path.join(tools, "twgsl.cjs"))(path.join(tools, "twgsl.wasm"));
  return (source, stage) => {
    const input = path.join(scratch, "shader.glsl");
    const binary = path.join(scratch, "shader.spv");
    fs.writeFileSync(input, source);
    execFileSync(glslang, ["-V", "-Os", "-S", stage === "vertex" ? "vert" : "frag", input, "-o", binary]);
    const bytes = fs.readFileSync(binary);
    const result = tint.convertSpirV2WGSL(new Uint32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4));
    assert.ok(result.trim() && !result.trimStart().startsWith("error"), result);
    return result;
  };
}
