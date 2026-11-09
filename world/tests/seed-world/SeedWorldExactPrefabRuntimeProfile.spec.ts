import { describe, expect, it, vi } from "vitest";
import type {
  SeedWorldExactPrefabRuntime,
  SeedWorldExactPrefabRuntimeProfile
} from "../../../packages/world-planning/src/world/SeedWorldExactPrefabRuntimeProfile.ts";

const rockRuntimeConstructor = vi.hoisted(() => vi.fn());

vi.mock("../../../packages/world-planning/src/runtime/SeedWorldRockRuntime.ts", () => ({
  SeedWorldRockRuntime: class {
    constructor(...args: unknown[]) {
      rockRuntimeConstructor(...args);
    }
  }
}));
vi.mock("../../../packages/world-planning/src/runtime/SeedWorldSmallRockRuntime.ts", () => ({ SeedWorldSmallRockRuntime: class {} }));
vi.mock("../../../packages/world-planning/src/world/SeedWorldMushroomRuntime.ts", () => ({ SeedWorldMushroomRuntime: class {} }));
vi.mock("../../../packages/world-planning/src/world/SeedWorldLotusRuntime.ts", () => ({ SeedWorldLotusRuntime: class {} }));

describe("SeedWorldExactPrefabRuntimeProfile", () => {
  it("routes published feature parent rocks into the large-rock runtime", async () => {
    const { SEED_WORLD_EXACT_PREFAB_RUNTIME_PROFILES } = await import(
      "../../../packages/world-planning/src/world/SeedWorldExactPrefabRuntimeProfile.ts"
    );
    const lakeCentreRock = { id: "lake-centre", category: "rock", sourceKind: "lake-outcrop" };
    const lakeRingRock = { id: "lake-ring", category: "rock", sourceKind: "riverbank" };
    const debris = { id: "debris", category: "stone", sourceKind: "riverbank" };
    const profile = SEED_WORLD_EXACT_PREFAB_RUNTIME_PROFILES.find(({ key }) => key === "rock");

    expect(profile?.entityName).toBe("Feature Rocks");
    profile!.create(createContext({}, [lakeCentreRock, lakeRingRock, debris]), { name: "Feature Rocks" } as never);

    expect(rockRuntimeConstructor).toHaveBeenCalledTimes(1);
    expect(rockRuntimeConstructor.mock.calls[0]![5]).toEqual([lakeCentreRock, lakeRingRock]);
  });

  it("registers arbitrary configured sources with shared entries, LOD tuning, and reverse teardown", async () => {
    const { SeedWorldExactPrefabRuntimeRegistry } = await import(
      "../../../packages/world-planning/src/world/SeedWorldExactPrefabRuntimeProfile.ts"
    );
    const events: string[] = [];
    const first = createRuntime("bridge", events);
    const second = createRuntime("roadside", events);
    const profiles: readonly SeedWorldExactPrefabRuntimeProfile[] = [
      {
        key: "bridge",
        entityName: "Bridges",
        create: (_context, root) => {
          events.push(`create:${(root as unknown as { name: string }).name}`);
          return first;
        }
      },
      {
        key: "roadside",
        entityName: "Roadside Props",
        create: (_context, root) => {
          events.push(`create:${(root as unknown as { name: string }).name}`);
          return second;
        }
      }
    ];

    const registry = new SeedWorldExactPrefabRuntimeRegistry(createContext(), profiles);
    expect(registry.require("bridge")).toBe(first);
    expect(registry.exactInstances.map((entry) => entry.id)).toEqual(["bridge", "roadside"]);

    registry.setLodTuning({ enabled: false, distanceScale: 1.5 });
    registry.applyAuthoringHeightPatch({} as never, {
      minimumX: -10,
      minimumZ: -10,
      maximumX: 10,
      maximumZ: 10
    });
    registry.destroy();

    expect(first.setLodTuning).toHaveBeenCalledWith({ enabled: false, distanceScale: 1.5 });
    expect(second.setLodTuning).toHaveBeenCalledWith({ enabled: false, distanceScale: 1.5 });
    expect(first.applyAuthoringHeightPatch).toHaveBeenCalledTimes(1);
    expect(second.applyAuthoringHeightPatch).toHaveBeenCalledTimes(1);
    expect(events).toEqual(["create:Bridges", "create:Roadside Props", "destroy:roadside", "destroy:bridge"]);
  });

  it("rejects duplicate keys and rolls back runtimes already created from configuration", async () => {
    const { SeedWorldExactPrefabRuntimeRegistry } = await import(
      "../../../packages/world-planning/src/world/SeedWorldExactPrefabRuntimeProfile.ts"
    );
    const events: string[] = [];
    const profiles: readonly SeedWorldExactPrefabRuntimeProfile[] = [
      { key: "bridge", entityName: "First", create: () => createRuntime("first", events) },
      { key: "bridge", entityName: "Second", create: () => createRuntime("second", events) }
    ];

    expect(() => new SeedWorldExactPrefabRuntimeRegistry(createContext(), profiles)).toThrow(
      'Seed World exact Prefab profile key "bridge" is duplicated'
    );
    expect(events).toEqual(["destroy:first"]);
  });

  it("omits unused authored rocks but rejects missing sources for published placements", async () => {
    const { SeedWorldExactPrefabRuntimeRegistry, SEED_WORLD_EXACT_PREFAB_RUNTIME_PROFILES } = await import(
      "../../../packages/world-planning/src/world/SeedWorldExactPrefabRuntimeProfile.ts"
    );
    const profiles = SEED_WORLD_EXACT_PREFAB_RUNTIME_PROFILES.filter(({ key }) =>
      key === "rock" || key === "stone" || key === "small-rock");
    const context = createContext() as unknown as { parent: { createChild: ReturnType<typeof vi.fn> } };
    context.parent.createChild = vi.fn();
    const registry = new SeedWorldExactPrefabRuntimeRegistry(context as never, profiles);
    expect(context.parent.createChild).not.toHaveBeenCalled();
    expect(registry.exactInstances).toEqual([]);
    expect(registry.get("stone")).toBeUndefined();
    expect(registry.get("small-rock")).toBeUndefined();
    expect(() => new SeedWorldExactPrefabRuntimeRegistry(
      createContext({}, [{ id: "requested-debris", category: "small-rock" }]), profiles
    )).toThrow("Small-rock Prefab runtime requires authored debris sources");
    registry.destroy();
  });

  it("accepts a fixed-renderer runtime without LOD tuning", async () => {
    const { SeedWorldExactPrefabRuntimeRegistry } = await import(
      "../../../packages/world-planning/src/world/SeedWorldExactPrefabRuntimeProfile.ts"
    );
    const destroy = vi.fn();
    const runtime: SeedWorldExactPrefabRuntime = {
      placementCount: 1,
      exactInstances: [{ id: "lotus", category: "lotus", controller: { setAuthoringVisible: vi.fn() } }] as never,
      destroy
    };
    const registry = new SeedWorldExactPrefabRuntimeRegistry(createContext(), [
      { key: "lotus", entityName: "Lotus", create: () => runtime }
    ]);

    expect(registry.exactInstances.map((entry) => entry.id)).toEqual(["lotus"]);
    expect(registry.exactSpatialEntries).toEqual([]);
    expect(() => registry.setLodTuning({ enabled: false, distanceScale: 2 })).not.toThrow();
    registry.destroy();
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});

function createRuntime(
  id: string,
  events: string[]
): SeedWorldExactPrefabRuntime & {
  readonly setLodTuning: ReturnType<typeof vi.fn>;
  readonly applyAuthoringHeightPatch: ReturnType<typeof vi.fn>;
} {
  return {
    placementCount: 1,
    exactInstances: [{ id, category: id, controller: { update: vi.fn(), setAuthoringVisible: vi.fn() } }] as never,
    setLodTuning: vi.fn(),
    applyAuthoringHeightPatch: vi.fn(),
    destroy: () => events.push(`destroy:${id}`)
  };
}

function createContext(fields: unknown = {}, decorations: readonly unknown[] = []) {
  return {
    engine: {},
    parent: {
      createChild(name: string) {
        return { name };
      }
    },
    camera: {},
    sourceLibrary: {},
    fields,
    decorations,
    crossFadeDurationSeconds: 0.5
  } as never;
}
