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
it("passes a rotated, independently scaled prefab frame to terrain compilation while keeping authored groups rigid", () => {
  const m = model(mutable(European.buildHouses({ id: "home" })));
  const flat = collectBuildingParts(m.frame, [m.group], m.members, undefined).terrain;
  const collect = () => collectBuildingParts(m.frame, [m.group], m.members, flat);
  const original = collect();
  const rotation = new Quaternion();
  Quaternion.rotationEuler(0, 0.43, 0, rotation);
  Matrix.affineTransformation(
    new Vector3(1.5, 0.8, 0.7),
    rotation,
    new Vector3(20, 0, -13),
    m.frame.transform.worldMatrix
  );
  const scaled = collect();
  expect(scaled.execution).toBe("worker");
  expect(scaled.placement.position).toEqual([20, 0, -13]);
  expect(scaled.placement.rotationY).toBeCloseTo(0.43);
  for (const [axis, expected] of [1.5, 0.8, 0.7].entries()) expect(scaled.placement.scale![axis]).toBeCloseTo(expected);
  expect(scaled.draft).toEqual(original.draft);
  expect(scaled.signature).not.toBe(original.signature);
  m.body.transform.localMatrix.elements[0] = 2;
  expect(collect).toThrow(/horizontal rigid/);
  m.body.transform.localMatrix.identity();
  m.frame.transform.worldMatrix.elements[4] = 0.4;
  expect(collect).toThrow(/horizontal rigid/);
  m.frame.transform.worldMatrix.elements.fill(0);
  expect(collect).toThrow(/positive finite scale/);
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
  other.transform.localMatrix.elements[12] = Number.NaN;
  expect(() => collectBuildingParts(m.frame, [m.group], m.members, undefined)).toThrow(/Move the group/);
});

it("validatePartCollection reads raw definitions without cloning", () => {
  const draftA = mutable(European.buildHouses({ id: "homeA" }));
  const draftB = mutable(European.buildHouses({ id: "homeB" }));
  const b = model(draftB);

  const engine = {},
    scene = {};
  const frameA: any = {
    engine,
    scene,
    destroyed: false,
    parent: null,
    transform: { localMatrix: new Matrix(), worldMatrix: new Matrix() }
  };
  const bodyA: any = { engine, scene, destroyed: false, parent: frameA, transform: { localMatrix: new Matrix() } };
  let cloneReads = 0;

  const groupA = Object.create(BuildingGroupComponent.prototype);
  Object.defineProperties(groupA, {
    entity: { value: bodyA },
    frame: { value: frameA },
    _definition: { value: draftA.groups[0] },
    definition: {
      get: () => {
        cloneReads++;
        return structuredClone(draftA.groups[0]);
      }
    }
  });
  const partsA = draftA.parts.map((def) => {
    const p = Object.create(BuildingPartComponent.prototype);
    const conns = draftA.connections.filter((c) => (c.kind === "attach" ? c.guest : c.parts[0]) === def.id);
    Object.defineProperties(p, {
      entity: { value: bodyA },
      frame: { value: frameA },
      _definition: { value: def },
      _connections: { value: conns },
      definition: {
        get: () => {
          cloneReads++;
          return structuredClone(def);
        }
      },
      connections: {
        get: () => {
          cloneReads++;
          return structuredClone(conns);
        }
      }
    });
    return p as BuildingPartComponent;
  });
  const membersA = [groupA, ...partsA];

  validatePartCollection([...membersA, ...b.members]);
  expect(cloneReads).toBe(0);
});
