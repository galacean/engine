import { describe, expect, it } from "vitest";
import { resolvePitchedRoofAttachment } from "../src/building/runtime/ConstructionPitchedRoofAttachment";
import { gothicHostSurface, type GothicSupportMesh } from "../src/building/runtime/GothicHostSurface";
import { gothicPlacement, gothicUVPosition } from "../src/building/runtime/GothicPlacement";
import type { RoofSurface, RoofFootprint } from "../src/building/runtime/RecoveredRoofMath";

const surface: RoofSurface = {
  type: "native_rectangular_roof_profile",
  base_height: 5,
  height_parameter: 0.8,
  profile: 0.7,
  ridge_parameter: 0.35,
  eave_parameter: 0.2,
  axis: 1,
  edge_mode: 0,
  tip_offset: [0, 0]
};
const rectangle: RoofFootprint = {
  center: [11, -7],
  orientation: [Math.cos(0.47), Math.sin(0.47)],
  width: 10,
  depth: 8
};
const circle: RoofFootprint = { center: [11, -7], radius: 5, phase: 0.47 };
function editorUV(footprint: RoofFootprint, p: readonly number[]) {
  const circular = "radius" in footprint;
  const angle = circular ? footprint.phase : Math.atan2(footprint.orientation[1], footprint.orientation[0]);
  const c = Math.cos(angle),
    s = Math.sin(angle);
  const x = p[0] - footprint.center[0],
    z = p[2] - footprint.center[1];
  return [
    0.5 + (c * x + s * z) / (circular ? footprint.radius * 2 : footprint.width),
    0.5 - (-s * x + c * z) / (circular ? footprint.radius * 2 : footprint.depth)
  ];
}
const requireHit = (result: ReturnType<typeof resolvePitchedRoofAttachment>) => {
  expect(result.ok).toBe(true);
  if (!result.ok) throw Error(result.reason);
  return result.attachment;
};

describe("editor roof chart to original attachment surface", () => {
  for (const [name, footprint] of [
    ["rectangle", rectangle],
    ["circle", circle]
  ] as const) {
    for (const tip of [
      [0, 0],
      [0.25, -0.2]
    ]) {
      it(`${name}, tip ${tip}: retains the original hit and facing without confusing chart UVs`, () => {
        const roof = {
          ...surface,
          type:
            "radius" in footprint
              ? ("native_circular_roof_profile" as const)
              : ("native_rectangular_roof_profile" as const),
          tip_offset: tip
        };
        const nativeUV = [0.13, 0.32];
        const original = gothicPlacement(roof, footprint, nativeUV)!;
        const uv = editorUV(footprint, original.translation);
        expect(Math.hypot(uv[0] - nativeUV[0], uv[1] - nativeUV[1])).toBeGreaterThan(0.1);
        const hit = requireHit(resolvePitchedRoofAttachment(roof, footprint, uv));
        hit.surfacePosition.forEach((v, i) => expect(v).toBeCloseTo(original.translation[i], 5));
        hit.transform.quaternion.forEach((v, i) => expect(v).toBeCloseTo(original.rotation[i], 5));
        const nativePosition = gothicUVPosition(gothicHostSurface(roof, footprint), hit.meshUV, roof.base_height)!;
        nativePosition.forEach((v, i) => expect(v).toBeCloseTo(hit.surfacePosition[i], 5));
        expect(hit.transform.position).not.toBe(hit.surfacePosition);
      });
    }
    it(`${name}: bottom raises the shared attachment without moving the surface anchor or facing`, () => {
      const roof = {
        ...surface,
        type:
          "radius" in footprint
            ? ("native_circular_roof_profile" as const)
            : ("native_rectangular_roof_profile" as const)
      };
      const uv = editorUV(footprint, gothicPlacement(roof, footprint, [0.13, 0.32])!.translation);
      const base = requireHit(resolvePitchedRoofAttachment(roof, footprint, uv));
      const raised = requireHit(resolvePitchedRoofAttachment(roof, footprint, uv, 0.375));
      expect(raised.surfacePosition).toEqual(base.surfacePosition);
      expect(raised.transform.quaternion).toEqual(base.transform.quaternion);
      expect(raised.transform.position[1] - base.transform.position[1]).toBeCloseTo(0.375, 5);
      expect(raised.transform.position[0]).toBe(base.transform.position[0]);
      expect(raised.transform.position[2]).toBe(base.transform.position[2]);
    });
  }
  it("does not snap the empty corners of a circular roof to the perimeter", () => {
    expect(resolvePitchedRoofAttachment({ ...surface, type: "native_circular_roof_profile" }, circle, [0, 0])).toEqual({
      ok: false,
      reason: "outside-roof"
    });
  });
  it("reports a flat roof separately from a pitched roof's top cap", () => {
    expect(resolvePitchedRoofAttachment({ ...surface, height_parameter: 0 }, rectangle, [0.5, 0.5])).toEqual({
      ok: false,
      reason: "flat-roof"
    });
    expect(resolvePitchedRoofAttachment(surface, rectangle, [0.5, 0.5])).toEqual({
      ok: false,
      reason: "horizontal-cap"
    });
  });
  it("keeps roof-chart seams placeable and deterministic", () => {
    const roof = { ...surface, type: "native_circular_roof_profile" as const };
    const support = gothicHostSurface(roof, circle);
    const position = gothicUVPosition(support, [0, 1 / 3], roof.base_height)!;
    const uv = editorUV(circle, position);
    const first = requireHit(resolvePitchedRoofAttachment(roof, circle, uv, 0, support));
    first.surfacePosition.forEach((v, i) => expect(v).toBeCloseTo(position[i], 5));
    expect(resolvePitchedRoofAttachment(roof, circle, uv, 0, support)).toEqual({ ok: true, attachment: first });
  });
  it("chooses the topmost hit and rejects its cap instead of falling through to a lower slope", () => {
    const footprint: RoofFootprint = { center: [0, 0], width: 4, depth: 4, orientation: [1, 0] };
    const support: GothicSupportMesh = {
      triangles: [
        [
          [-2, 0, -2],
          [2, 0, -2],
          [0, 1, 2]
        ],
        [
          [-2, 4, -2],
          [2, 4.01, -2],
          [0, 4, 2]
        ]
      ],
      normals: [],
      uvs: [
        [
          [0, 0],
          [1, 0],
          [0.5, 1]
        ],
        [
          [0, 2],
          [1, 2],
          [0.5, 2.1]
        ]
      ]
    };
    expect(resolvePitchedRoofAttachment(surface, footprint, [0.5, 0.5], 0, support)).toEqual({
      ok: false,
      reason: "horizontal-cap"
    });
    support.uvs[1] = [
      [0, 0],
      [1, 0],
      [0.5, 1]
    ];
    const hit = requireHit(resolvePitchedRoofAttachment(surface, footprint, [0.5, 0.5], 0, support));
    expect(hit.triangle).toBe(1);
    expect(hit.surfacePosition[1]).toBeGreaterThan(9);
  });
  it("rejects malformed author coordinates before entering original sampling", () => {
    for (const uv of [[NaN, 0.5], [0.5], [0, 2]])
      expect(() => resolvePitchedRoofAttachment(surface, rectangle, uv)).toThrow();
    expect(() => resolvePitchedRoofAttachment(surface, rectangle, [0.5, 0.5], -1)).toThrow();
  });
});
