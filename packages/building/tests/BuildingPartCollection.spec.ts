import { BuildingGroupComponent } from "../src/building/parts/architecture/BuildingGroupComponent";
import { buildingPartKey, buildingGroupKey } from "../src/building/runtime/BuildingObjectIdentity";
import { it, expect, vi } from "vitest";
vi.mock("@galacean/engine", async () => ({
  ...(await import("@galacean/engine-core")),
  ...(await import("@galacean/engine-loader")),
  ...(await import("@galacean/engine-math"))
}));
import { buildingPlacementAlgorithms } from "../src/building/parts/BuildingAlgorithms";
import { buildingConnectionRules } from "../src/building/parts/architecture/BuildingDesignRules";
import { validateBuildingWorkerDraft } from "../src/building/parts/architecture/BuildingCpu";
import { Matrix, Quaternion, Vector3 } from "@galacean/engine-math";
import { BuildingPartComponent } from "../src/building/parts/architecture/BuildingPartComponent";
import { European } from "../src/building/parts/architecture/European";
import {
  collectBuildingParts,
  partFrameInverse,
  partFrameMatrix,
  validatePartCollection
} from "../src/building/parts/architecture/BuildingPartCollection";
import { prepareBuildingCpu, compileBuildingCpu } from "../src/building/parts/architecture/BuildingCpu";
import { nativeAssets } from "./fixtures/constructionAssets";
import type { BuildingDraft } from "../src/building/parts/architecture/BuildingDraft";
import { createHash } from "node:crypto";

function model(draft: BuildingDraft) {
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
      relations: { get: () => structuredClone(draft.relations.filter((r) => r.from.part === definition.id)) }
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
it("flat author components compile to the same geometry without an old Source component", async () => {
  const draft = European.buildHouses({
    id: "home",
    seed: 17,
    height: 5,
    rectangle: { center: [0, 0], size: [10, 8], rotation: 0 },
    roof: { height: 0.9, ridge_length: 0.35, profile: 0.7 },
    foundation: { height: 0.5 },
    attachments: [
      {
        id: "window",
        kind: "window",
        type: "window-cottage",
        host: "wall",
        u: 0.35,
        bottom: 1.2,
        width: 1.2,
        height: 1.5,
        seed: 17
      }
    ]
  });
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
  const draft = European.buildHouses({ id: "home" }),
    m = model(draft),
    rotation = new Quaternion();
  Quaternion.rotationEuler(0, 0.43, 0, rotation);
  Matrix.affineTransformation(new Vector3(1, 1, 1), rotation, new Vector3(20, 0, -13), m.body.transform.localMatrix);
  const input = collectBuildingParts(m.frame, [m.group], m.members, undefined);
  const shape = input.draft.parts.find((p) => p.type === "wall")!.support.params.rectangle;
  expect(shape.center).toEqual([20, -13]);
  expect(shape.rotation).toBeCloseTo(-0.43);
  expect(draft.parts[0].support.params.rectangle.center).toEqual([0, 0]);
  const expected = new Matrix();
  Matrix.invert(m.body.transform.localMatrix, expected);
  expect(input.bindings.get(buildingGroupKey("home"))!.inverse).toEqual(Array.from(expected.elements));
});
it("keeps a native window at its bind pose under a rotated house in the actual world", () => {
  const draft = European.buildHouses({
    id: "home",
    attachments: [
      { id: "window", kind: "window", type: "window-cottage", host: "wall", u: 0.2, bottom: 0.85, width: 1, height: 1 }
    ]
  });
  const m = model(draft);
  const position = new Vector3(-2.0218450361969538, 0.85, -3.8619027137756348);
  const window: any = {
    parent: m.body,
    engine: m.body.engine,
    scene: m.body.scene,
    transform: { position, localMatrix: new Matrix() }
  };
  Matrix.translation(position, window.transform.localMatrix);
  Matrix.affineTransformation(
    new Vector3(1, 1, 1),
    new Quaternion(0, -0.8538823869815105, 0, 0.5204660115730497),
    new Vector3(),
    m.body.transform.localMatrix
  );
  const mount = draft.parts.find((p) => p.support.generator === "attachmentMount")!;
  mount.support.params.point = [0, 0, 0];
  delete mount.support.params.spec.u;
  delete mount.support.params.spec.bottom;
  Object.defineProperty(m.parts.find((p) => p.definition!.id === mount.id)!, "entity", { value: window });
  const input = collectBuildingParts(m.frame, [m.group], m.members, undefined);
  const world = new Matrix(),
    hostWorld = new Matrix(),
    windowWorld = new Matrix(),
    inverseWorld = new Matrix(),
    binding = new Matrix(),
    result = new Matrix();
  Matrix.translation(new Vector3(841.4472842723735, 0, 133.76671665602134), world);
  Matrix.multiply(world, m.body.transform.localMatrix, hostWorld);
  Matrix.multiply(hostWorld, window.transform.localMatrix, windowWorld);
  binding.copyFromArray(input.bindings.get(buildingPartKey("home/window"))!.inverse);
  Matrix.multiply(windowWorld, binding, result);
  Matrix.invert(world, inverseWorld);
  Matrix.multiply(inverseWorld, result, result);
  // These are the exact float32 matrices consumed by RigidDecorationRenderer.
  // Inverting the composed host+mount previously left a 1.5e-5m Z translation.
  expect(Array.from(result.elements)).toEqual(Array.from(new Matrix().elements));
  expect(() => partFrameInverse(window, { ...m.frame })).toThrow(/ancestor/);
});
it("rejects unrelated frames, dangling relations and ambiguous logical identities before publication", () => {
  const draft = European.buildHouses({ id: "home" }),
    m = model(draft);
  expect(() => partFrameMatrix(m.body, { ...m.frame })).toThrow(/ancestor/);
  draft.relations[0].to.part = "missing";
  expect(() => validatePartCollection(m.members)).toThrow(/endpoint/);
  const collision = European.buildHouses({
    id: "home",
    attachments: [
      { id: "home", kind: "window", type: "window-cottage", host: "wall", u: 0.2, bottom: 1, width: 1, height: 1 }
    ]
  });
  expect(() => validatePartCollection(model(collision).members)).not.toThrow();
  const attachment = collision.parts.find((p) => p.support.generator === "attachmentMount")!;
  collision.relations.find((r) => r.from.part === attachment.id)!.from.part = "home";
  attachment.id = "home";
  expect(() => validatePartCollection(model(collision).members)).not.toThrow();
});
it("generic supports select main-thread execution without a native material library", () => {
  const draft: BuildingDraft = {
    groups: [{ id: "lamp", seed: 17, wallColor: 0, woodColor: 0 }],
    parts: [
      {
        id: "lamp-body",
        type: "lamp",
        group: "lamp",
        support: { generator: "point", params: {} },
        algorithm: { type: "placeAtPoint" },
        unit: { name: "lamp" },
        params: {}
      }
    ],
    relations: []
  };
  const m = model(draft);
  Object.defineProperty(m.group, "assetLibrary", { value: null });
  const input = collectBuildingParts(m.frame, [m.group], m.members, undefined);
  expect(input.execution).toBe("main");
  expect(input.assets).toBeUndefined();
  expect(input.draft.parts[0].transform).toEqual(Array.from(new Matrix().elements));
});
it("different local frames for joined profile parts are rejected, not silently normalized", () => {
  const m = model(European.buildHouses({ id: "home" }));
  const other: any = { ...m.body, transform: { localMatrix: new Matrix() } };
  other.transform.localMatrix.elements[12] = 2;
  Object.defineProperty(m.parts[1], "entity", { value: other });
  expect(() => collectBuildingParts(m.frame, [m.group], m.members, undefined)).toThrow(/share a group frame/);
});

it.each(["profile", "connection", "attachment", "dormerRoof"])(
  "%s custom code is selected for main-thread execution before Worker dispatch",
  (kind) => {
    const draft = European.buildHouses({
      id: "home",
      attachments: [
        {
          id: "window",
          kind: "window",
          type: "window-cottage",
          host: "wall",
          u: 0.2,
          bottom: 1,
          width: 1,
          height: 1
        }
      ]
    });
    const name = "test.live-" + kind;
    if (kind === "connection") {
      buildingConnectionRules.register(name, (context) => buildingConnectionRules.resolve("wallRoofJoint")(context));
      draft.relations.find((r) => r.rule === "wallRoofJoint")!.rule = name;
    } else {
      buildingPlacementAlgorithms.register(name, () => [], kind === "profile" ? { profile: { basis: "grid" } } : {});
      const part = draft.parts.find((p) => p.type === (kind === "profile" ? "roof" : "window"))!;
      if (kind === "dormerRoof") part.params.roofAlgorithm = name;
      else part.algorithm.type = name;
    }
    const m = model(draft);
    const input = collectBuildingParts(m.frame, [m.group], m.members, undefined);
    expect(input.execution).toBe("main");
    expect(() => validateBuildingWorkerDraft(draft)).toThrow(/not bundled for Worker execution/);
  }
);

it("selects main before dispatch for a custom derived spire algorithm", () => {
  buildingPlacementAlgorithms.register("test.custom-finial-realm", () => ({
    kind: "records",
    format: "roof-spire/v1",
    records: []
  }));
  const draft = European.buildTower({ id: "tower" });
  draft.parts.find((p) => p.type === "roof")!.params.spireAlgorithm = "test.custom-finial-realm";
  const m = model(draft);
  expect(collectBuildingParts(m.frame, [m.group], m.members, undefined).execution).toBe("main");
  expect(() => validateBuildingWorkerDraft(draft)).toThrow(/not bundled for Worker execution/);
});
