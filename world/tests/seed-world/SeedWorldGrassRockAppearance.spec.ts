import { describe, expect, it } from "vitest";
import { GrassRockAppearance, GRASS_ROCK_APPEARANCE_STRIDE } from "../../../packages/world-planning/src/integrations/terrain/rock-formation/GrassRockAppearance.ts";
import type { RockFormationMesh, V3 } from "../../../packages/terrain/src/rock-formation/types.ts";
import type { SeedWorldFields } from "../../../packages/world-planning/src/runtime/SeedWorldFields.ts";

function wall(origin: V3 = [0, 0, 0]) {
  const formation: RockFormationMesh = { id: "wall", origin: [0,0,0], owners: ["wall"],
    stats: { bodies: 0, vertices: 0 }, mesh: {
      positions: new Float32Array([0,0,-2, 0,3,-2, 0,0,2]), indices: new Uint32Array([0,1,2]),
      normals: new Float32Array([1,0,0, 1,0,0, 1,0,0]) } };
  return { formation, origin };
}
const fields = { sizeMetres: 8, worldOrigin: [-4,-4], heightResolution: 2,
  heightSamples: new Uint16Array(4), heightDecode: { offset: 0, scale: 10 },
  surfaceHeights: new Float32Array(4).fill(20) } as unknown as SeedWorldFields;
const roots = (x = .1, y = 0, z = 0) => new Float32Array([x,y,z,0,2,2,2,1,0,0,0,1,0]);

describe("near-rock grass appearance source", () => {
  it("preserves grass geometry and uses rock-vertex R16 clearances rather than blade height or float geometry", () => {
    const input = roots(), before = input.slice();
    const output = new GrassRockAppearance([wall()]).compile(input,1,.17,fields)!;
    expect(input).toEqual(before);
    expect(output).toHaveLength(GRASS_ROCK_APPEARANCE_STRIDE);
    expect([output[15],output[19],output[23]]).toEqual([0,3,0]);
    expect(output[26]).toBe(1);
  });
  it("ignores remote grass and geometry far above the blades", () => {
    expect(new GrassRockAppearance([wall()]).compile(roots(6),1,.17,fields)).toBeUndefined();
    expect(new GrassRockAppearance([wall([0,10,0])]).compile(roots(),1,.17,fields)).toBeUndefined();
  });
  it("tracks world placement, removal, and replacement terrain heights", () => {
    const query = new GrassRockAppearance([wall([1,0,0])]);
    const result = query.compile(roots(1.1),1,.17,fields)!;
    expect(result[0]).toBe(1);
    const raised = { ...fields, heightSamples: new Uint16Array(4).fill(65535) };
    expect(query.compile(roots(1.1),1,.17,raised)![15]).toBe(-10);
    expect(new GrassRockAppearance([]).compile(roots(),1,.17,fields)).toBeUndefined();
  });
  it("preserves first-face ties, normals and immutable constructor snapshots", () => {
    const first = wall(), second = wall();
    first.formation.mesh.normals = new Float32Array([.2,.3,.4, .4,.5,.6, .6,.7,.8]);
    const source = new GrassRockAppearance([first, second]);
    const expected = source.compile(roots(), 1, .17, fields)!;
    expect(Array.from(expected.slice(12, 15))).toEqual(Array.from(first.formation.mesh.normals!.slice(0, 3)));
    first.formation.mesh.positions.fill(100);
    first.formation.mesh.normals!.fill(0);
    expect(source.compile(roots(), 1, .17, fields)).toEqual(expected);
    // Interleaved compilations must not share mutable triangle scratch space.
    const a = source.compileIncrementally(roots(), 1, .17, fields);
    const b = source.compileIncrementally(roots(100), 1, .17, fields);
    expect(b.next()).toEqual({done: true, value: undefined});
    expect(a.next()).toEqual({done: true, value: expected});
  });
  it("resumes dense candidate scans without changing packed records or input transforms", () => {
    const placements = Array.from({ length: 256 }, (_, i) => wall([i / 64, 0, 0]));
    const input = new Float32Array(130 * 13);
    for (let i = 0; i < 130; i++) input.set(roots((i % 50) / 10), i * 13);
    const before = input.slice();
    const source = new GrassRockAppearance(placements);
    const task = source.compileIncrementally(input, 130, .17, fields);
    let step = task.next(), slices = 0;
    while (!step.done) { slices++; step = task.next(); }
    expect(slices).toBeGreaterThan(130);
    expect(step.value).toEqual(source.compile(input, 130, .17, fields));
    expect(input).toEqual(before);
  });
  it("yields even when all blades are remote and returns no appearance buffer", () => {
    const input = new Float32Array(100 * 13);
    for (let i = 0; i < 100; i++) input.set(roots(100), i * 13);
    const task = new GrassRockAppearance([wall()]).compileIncrementally(input, 100, .17, fields);
    let step = task.next(), slices = 0;
    while (!step.done) { slices++; step = task.next(); }
    expect(slices).toBe(3);
    expect(step.value).toBeUndefined();
  });
});
