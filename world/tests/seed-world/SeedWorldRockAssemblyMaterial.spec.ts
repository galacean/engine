import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { rockSurfaceAttributes } from "../../../packages/terrain/src/rock-formation/SurfaceAttributes";
import type { RockFormationMesh } from "../../../packages/terrain/src/rock-formation/types";

const root = path.resolve(__dirname, "../../..");
const require = createRequire(import.meta.url);
const { ShaderPrecompiler } = require(path.join(root, "packages/shader-compiler/dist/precompile.main.js"));
function includes(directory: string, prefix = "", result: Record<string, string> = {}) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name),
      key = prefix + entry.name;
    if (entry.isDirectory()) includes(file, key + "/", result);
    else if (entry.name.endsWith(".glsl")) result[key] = fs.readFileSync(file, "utf8");
  }
  return result;
}

describe("Common Surface rock integration", () => {
  it("precompiles Surface with UV, world projection, terrain coverage, instancing and shadow branches", () => {
    const library = includes(path.join(root, "packages/shader/src/ShaderLibrary"), "ShaderLibrary/");
    for (const { original, replacement } of JSON.parse(
      fs.readFileSync(path.join(root, "packages/modify/native-overrides.json"), "utf8")
    )) {
      if (original.startsWith("packages/shader/src/ShaderLibrary/") && original.endsWith(".glsl"))
        library[original.slice("packages/shader/src/".length)] = fs.readFileSync(path.join(root, replacement), "utf8");
    }
    includes(path.join(root, "packages/terrain/src/shaders"), "", library);
    const compiler = new ShaderPrecompiler();
    compiler.setIncludeMap(library);
    const result = compiler.precompile(
      fs.readFileSync(path.join(root, "packages/terrain/src/shaders/Surface.shader"), "utf8"),
      0
    );
    expect(result.name).toBe("Terrain/Surface");
    expect(result.subShaders[0].passes.map((pass: { name: string }) => pass.name)).toEqual(["Forward", "ShadowCaster"]);
  }, 60000);

  it("retains generated geometry normals when expanding indexed triangles for rendering", () => {
    const formation = {
      owners: ["rock"],
      mesh: {
        positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
        normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
        indices: new Uint32Array([2, 0, 1])
      }
    } as unknown as RockFormationMesh;
    const { data, stride } = rockSurfaceAttributes(formation);
    for (let i = 0; i < 3; i++) expect([...data.slice(i * stride + 3, i * stride + 6)]).toEqual([0, 0, 1]);
  });

  it("ships both shared desert textures as 512 KTX2 with mipmaps", () => {
    for (const name of ["SandSurfaceBase", "SandSurfaceNormal"]) {
      const data = fs.readFileSync(path.join(root, `world/demos/seed-world/assets/desert-surface/${name}.ktx2`));
      expect(data.subarray(1, 7).toString()).toBe("KTX 20");
      expect(data.readUInt32LE(20)).toBe(512);
      expect(data.readUInt32LE(24)).toBe(512);
      expect(data.readUInt32LE(40)).toBe(10);
    }
  });
});
