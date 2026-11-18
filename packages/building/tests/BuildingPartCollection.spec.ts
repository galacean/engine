import { BuildingGroupComponent } from "../src/building/parts/architecture/BuildingGroupComponent";
import { buildingPartKey, buildingGroupKey } from "../src/building/runtime/BuildingObjectIdentity";
import { it, expect, vi } from "vitest";
vi.mock("@galacean/engine", async () => ({
  ...(await import("@galacean/engine-core")),
  ...(await import("@galacean/engine-loader")),
  ...(await import("@galacean/engine-math"))
}));
import { Matrix, Quaternion, Vector3 } from "@galacean/engine-math";
import { BuildingPartComponent } from "../src/building/parts/architecture/BuildingPartComponent";
import { European } from "../src/building/application/European";
import {
  collectBuildingParts,
  partFrameMatrix,
  validatePartCollection
} from "../src/building/parts/architecture/BuildingPartCollection";
import { prepareBuildingCpu, compileBuildingCpu } from "../src/building/parts/architecture/BuildingCpu";
import { nativeAssets } from "./fixtures/constructionAssets";
import type { BuildingCoreDraft } from "../src/building/core";
import { createHash } from "node:crypto";

type Draft = {
  groups: BuildingCoreDraft["groups"][number][];
  parts: BuildingCoreDraft["parts"][number][];
  connections: NonNullable<BuildingCoreDraft["connections"]>[number][];
};
const mutable = (draft: BuildingCoreDraft): Draft => ({
  groups: [...draft.groups],
  parts: [...draft.parts],
  connections: [...(draft.connections ?? [])]
});
function model(draft: Draft) {
  const engine = {},
    scene = {},
    library = { engine, destroyed: false, instanceId: 7 };
  const frame: any = {
    engine,
    scene,
    destroyed: false,
    parent: null,
    transform: { localMatrix: new Matrix(), worldMatrix: new Matrix() }
  };
  const body: any = { engine, scene, destroyed: false, parent: frame, transform: { localMatrix: new Matrix() } };
  const parts = draft.parts.map((definition) => {
    const p = Object.create(BuildingPartComponent.prototype);
    Object.defineProperties(p, {
      entity: { value: body, configurable: true },
      frame: { value: frame },
      definition: { get: () => structuredClone(definition) },
      connections: {
        get: () =>
          structuredClone(
            draft.connections.filter((c) => (c.kind === "attach" ? c.guest : c.parts[0]) === definition.id)
          )
      }
    });
    return p as BuildingPartComponent;
  });
  const group = Object.create(BuildingGroupComponent.prototype);
  Object.defineProperties(group, {
    entity: { value: body },
    frame: { value: frame },
    assetLibrary: { value: library, configurable: true },
    definition: { get: () => structuredClone(draft.groups[0]) }
  });
  return { frame, body, parts, group, members: [group, ...parts], library };
}
const hash = (value: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(value, (_, v) => (typeof v === "bigint" ? String(v) : v)))
    .digest("hex");
it("flat author components compile to the same geometry as their draft", async () => {
  const draft = mutable(
    European.buildHouses({
      id: "home",
      seed: 17,
      height: 5,
      rectangle: { center: [0, 0], size: [10, 8], rotation: 0 },
      roof: { height: 0.9, ridge_length: 0.35, profile: 0.7 },
      attachments: [{ id: "window", kind: "window", u: 0.35, bottom: 1.2, width: 1.2, height: 1.5 }]
    })
  );
  const m = model(draft);
  validatePartCollection(m.members);
  const input = collectBuildingParts(m.frame, [m.group], m.members, undefined);
  expect(input.execution).toBe("worker");
  expect(input.bindings.has(buildingGroupKey("home"))).toBe(true);
  expect(input.bindings.has(buildingPartKey("home/window"))).toBe(true);
  const expected = await compileBuildingCpu(
    (await prepareBuildingCpu(draft, input.terrain.grid, nativeAssets.compilation)).prepared
  );
  const actual = await compileBuildingCpu(
    (await prepareBuildingCpu(input.draft, input.terrain.grid, nativeAssets.compilation)).prepared
  );
  expect(hash(actual.renderInput)).toBe(hash(expected.renderInput));
});
it("group transforms preserve local opening geometry and do not mutate definitions", () => {
  const draft = mutable(European.buildHouses({ id: "home" })),
    m = model(draft),
    rotation = new Quaternion();
  Quaternion.rotationEuler(0, 0.43, 0, rotation);
  Matrix.affineTransformation(new Vector3(1, 1, 1), rotation, new Vector3(20, 0, -13), m.body.transform.localMatrix);
  const input = collectBuildingParts(m.frame, [m.group], m.members, undefined);
  type Shared = { house: { footprint: { rectangle: { center: number[]; rotation: number } } } };
  const shape = (input.draft.groups[0].shared as Shared).house.footprint.rectangle;
  expect(shape.center[0]).toBeCloseTo(20);
  expect(shape.center[1]).toBeCloseTo(-13);
  expect(shape.rotation).toBeCloseTo(-0.43);
  expect((draft.groups[0].shared as Shared).house.footprint.rectangle.center).toEqual([0, 0]);
  const expected = new Matrix();
  Matrix.invert(m.body.transform.localMatrix, expected);
  expect(input.bindings.get(buildingGroupKey("home"))!.inverse).toEqual(Array.from(expected.elements));
});
it("rejects unrelated frames and duplicate identities before publication", () => {
  const draft = mutable(European.buildHouses({ id: "home" })),
    m = model(draft);
  expect(() => partFrameMatrix(m.body, { ...m.frame })).toThrow(/ancestor/);
  // A window may share its id with its house: part and group identities are separate.
  const collision = mutable(
    European.buildHouses({
      id: "home",
      attachments: [{ id: "home", kind: "window", u: 0.2, bottom: 1, width: 1, height: 1 }]
    })
  );
  expect(() => validatePartCollection(model(collision).members)).not.toThrow();
  collision.parts.push(structuredClone(collision.parts[0]));
  expect(() => validatePartCollection(model(collision).members)).toThrow(/duplicate/);
});
it("a part node moved away from its group is rejected, not silently normalized", () => {
  const m = model(mutable(European.buildHouses({ id: "home" })));
  const other: any = { ...m.body, parent: m.body, transform: { localMatrix: new Matrix() } };
  other.transform.localMatrix.elements[12] = 2;
  Object.defineProperty(m.parts[1], "entity", { value: other });
  expect(() => collectBuildingParts(m.frame, [m.group], m.members, undefined)).toThrow(/Move the group/);
});
