import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { engineShaderSource } from "../src/building/runtime/EngineShaderSource";
import { simplifySpirvNoise } from "../src/building/runtime/SimplifySpirvNoise";

const shadersDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/building/assets/native/Shaders");

function extractInstructions(instructions: unknown[] | undefined): string {
  return (instructions ?? [])
    .map((entry) => (Array.isArray(entry) && entry[0] === 0 && typeof entry[1] === "string" ? entry[1] : ""))
    .join("");
}

function uintBitsToFloat(u: number): number {
  const buf = new ArrayBuffer(4);
  const view = new DataView(buf);
  view.setUint32(0, u >>> 0, true);
  return view.getFloat32(0, true);
}

function tgJenkinsJs(x: number): number {
  let v = x >>> 0;
  v = (v + (v << 10)) >>> 0;
  v = (v ^ (v >>> 6)) >>> 0;
  v = (v + (v << 3)) >>> 0;
  v = (v ^ (v >>> 11)) >>> 0;
  return (v + (v << 15)) >>> 0;
}

function tgMixUJs(a: number, b: number): number {
  let h = Math.imul((Math.imul(a >>> 0, 1664525) + (b >>> 0) + 1013904223) >>> 0, 1664525) >>> 0;
  h = (h ^ (h >>> 11)) >>> 0;
  h = (h ^ ((h << 7) & 2636928640)) >>> 0;
  h = (h ^ ((h << 15) & 4022730752)) >>> 0;
  return (h ^ (h >>> 18)) >>> 0;
}

describe("SimplifySpirvNoise", () => {
  it("folds all dummy <1u / <2u loops and plaster FBM copies across all 16 building .shaderc files", () => {
    const files = fs
      .readdirSync(shadersDir)
      .filter((f) => f.endsWith(".shaderc"))
      .sort();
    expect(files.length).toBeGreaterThanOrEqual(16);

    for (const file of files) {
      const parsed = JSON.parse(fs.readFileSync(path.join(shadersDir, file), "utf8"));
      const pass = parsed.subShaders[0].passes[0];
      const vs = extractInstructions(pass.vertexShaderInstructions);
      const fsSrc = extractInstructions(pass.fragmentShaderInstructions);

      const sv = simplifySpirvNoise(vs);
      const sf = simplifySpirvNoise(fsSrc);

      // Every dummy 1-iteration and 2-iteration SPIRV-Cross hash loop is folded away.
      expect(sv).not.toMatch(/<\s*[12]u\)/);
      expect(sf).not.toMatch(/<\s*[12]u\)/);

      // engineShaderSource still lowers both stages cleanly without throwing.
      expect(() => engineShaderSource(sv)).not.toThrow();
      expect(() => engineShaderSource(sf)).not.toThrow();

      if (file === "plaster.shaderc") {
        expect(sf.length).toBeLessThan(fsSrc.length * 0.25);
        expect(sf).toContain("float tgOpt_plasterFbm(");
        const mainBody = sf.slice(sf.indexOf("void original_main()"));
        expect(mainBody).not.toContain("for (;;)");
      }
      if (file === "roof.shaderc") {
        const vsMain = sv.slice(sv.indexOf("void original_main()"));
        expect(vsMain).not.toContain("for (;;)");
      }
      if (file === "glass.shaderc") {
        const vsMain = sv.slice(sv.indexOf("void original_main()"));
        const fsMain = sf.slice(sf.indexOf("void original_main()"));
        expect(vsMain).not.toContain("for (;;)");
        expect(fsMain).not.toContain("for (;;)");
      }
    }
  });

  it("matches the original SPIRV-Cross 2D and 3D hash-loop outputs bit-for-bit", () => {
    for (const [cx, cy, cz] of [
      [0, 0, 0],
      [1, 2, 3],
      [-7, 13, -42],
      [1024, 2048, 4096]
    ]) {
      const ux = cx >>> 0;
      const uy = cy >>> 0;
      const uz = cz >>> 0;

      // Original 2D <1u loop
      const h2 = tgMixUJs(ux, tgJenkinsJs(uy));
      let orig2 = 0;
      let state2 = h2;
      for (let i = 0; i < 1; i++) {
        const next = tgJenkinsJs(state2);
        orig2 = uintBitsToFloat((state2 & 8388607) | 1065353216) - 1.0;
        state2 = next;
      }
      const opt2 = uintBitsToFloat((h2 & 8388607) | 1065353216) - 1.0;
      expect(opt2).toBe(orig2);

      // Original 3D <2u loop
      const h3 = tgMixUJs(ux, tgMixUJs(uy, tgJenkinsJs(uz)));
      const orig3 = [0, 0];
      let state3 = h3;
      for (let i = 0; i < 2; i++) {
        const next = tgJenkinsJs(state3);
        orig3[i] = uintBitsToFloat((state3 & 8388607) | 1065353216) - 1.0;
        state3 = next;
      }
      const opt3 = [
        uintBitsToFloat((h3 & 8388607) | 1065353216) - 1.0,
        uintBitsToFloat((tgJenkinsJs(h3) & 8388607) | 1065353216) - 1.0
      ];
      expect(opt3).toEqual(orig3);
    }
  });
});
