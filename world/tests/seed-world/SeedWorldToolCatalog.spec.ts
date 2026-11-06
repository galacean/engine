import { describe, expect, it } from "vitest";

import type { SeedWorldAgentApplication } from "../../demos/seed-world/agent-adapter/SeedWorldAgentApplication";
import { createSeedWorldTools } from "../../demos/seed-world/agent-adapter/SeedWorldToolCatalog";
import {
  SEED_WORLD_ASSET_CATALOG,
  SEED_WORLD_ASSET_KINDS,
  SEED_WORLD_ASSET_TYPE_CATALOG
} from "@galacean/engine-world-planning/agent-adapter/contracts/SeedWorldAssetContracts.ts";
import {
  SEED_WORLD_API_CONTRACTS,
  SEED_WORLD_API_NAMES
} from "../../demos/seed-world/agent-adapter/contracts/SeedWorldContractRegistry";
import {
  SEED_WORLD_API_DECLARATION_MODULES,
  SEED_WORLD_API_SEARCH_CATALOG,
  SEED_WORLD_API_SEARCH_ENTRIES
} from "../../demos/seed-world/agent-adapter/contracts/generated/SeedWorldApiSearchRegistry";
import { SEED_WORLD_MAXIMUM_EXACT_VEGETATION_INSTANCES } from "@galacean/engine-world-planning/world/SeedWorldPlanner.ts";

const API_NAMES = [
  "world.query",
  "world.inspect",
  "world.delete",
  "world.tag.update",
  "world.selection.save",
  "world.selection.get",
  "runtime.entity.inspect",
  "runtime.entity.children",
  "runtime.component.query",
  "runtime.component.read",
  "spatial.search",
  "spatial.check",
  "spatial.resolve",
  "spatial.viewer",
  "spatial.teleport",
  "time.get",
  "time.update",
  "building.generate",
  "atmosphere.get",
  "atmosphere.update",
  "terrain.patch",
  "terrain.create",
  "terrain.update",
  "water.create",
  "water.update",
  "vegetation.create",
  "vegetation.update",
  "world.parameters.describe",
  "world.parameters.query",
  "world.parameters.inspect",
  "world.parameters.apply",
  "world.parameters.receipt",
  "world.parameters.materials.inspect",
  "world.parameters.materials.apply",
  "world.animals.query",
  "world.animals.describe",
  "world.animals.command",
  "world.animals.receipt",
  "world.animals.catalog",
  "world.animals.spawn"
] as const;

const application = new Proxy(
  {},
  {
    get: (_, key) => key === "parameterAuthoring" || key === "animals" ? undefined : () => {
      throw new Error("Runtime execution is outside this contract-only test");
    }
  }
) as SeedWorldAgentApplication;

describe("Seed World final API contracts", () => {
  it("exposes the executable registry and only available runtime APIs", () => {
    const tools = createSeedWorldTools(application);

    expect(SEED_WORLD_API_NAMES).toEqual(API_NAMES);
    expect(SEED_WORLD_API_CONTRACTS.map(({ name }) => name)).toEqual(API_NAMES);
    expect(tools.map(({ name }) => name)).toEqual(API_NAMES.filter(name =>
      !name.startsWith("world.parameters.") && !name.startsWith("world.animals.")));
    expect(tools.every(({ parseInput, parseOutput, execute }) =>
      typeof parseInput === "function" && typeof parseOutput === "function" && typeof execute === "function"
    )).toBe(true);
    expect(
      [...new Set(SEED_WORLD_API_DECLARATION_MODULES.flatMap(({ toolNames }) => toolNames ?? []))].sort()
    ).toEqual([...API_NAMES].sort());
    const query = tools.find(({ name }) => name === "world.query")!;
    expect(query.parseInput({ kinds: ["tree"] })).toMatchObject({ kinds: ["tree"] });
    expect(() => query.parseInput({ kinds: ["birch"] })).toThrow(/Invalid option/);
    expect(new Set(API_NAMES).size).toBe(API_NAMES.length);
    expect(tools.some(({ name }) => name === "mount.command")).toBe(false);
    expect(SEED_WORLD_API_SEARCH_ENTRIES.some(({ name }) => name === "mount.command")).toBe(false);
    expect(API_NAMES.some((name) => name.includes("_"))).toBe(false);
  });

  it("keeps snapshot picking outside the execute API registry", () => {
    expect(createSeedWorldTools(application).some(tool => tool.name.startsWith("world.view."))).toBe(false);
    expect(SEED_WORLD_API_SEARCH_ENTRIES.some(entry => entry.name.startsWith("world.view."))).toBe(false);
  });

  it("defines the 27 asset kinds without the retired building-part authoring model", () => {
    expect(SEED_WORLD_ASSET_KINDS).toHaveLength(27);
    expect(SEED_WORLD_ASSET_CATALOG).toEqual({
      terrain: ["terrain", "mountain", "hill", "ridge", "canyon", "valley", "slope", "plateau", "basin"],
      water: ["ocean", "lake", "pond", "river", "stream"],
      vegetation: ["tree", "forest", "shrub", "shrubland", "grassland", "flower-field", "aquatic-grass-bed"],
      object: ["rock", "mushroom"],
      infrastructure: ["building", "road", "bridge"],
      poi: ["poi"]
    });
    expect(SEED_WORLD_API_SEARCH_CATALOG).toContain("| Asset Type | Asset Domain | APISearch Symbol |");
    for (const [kind, { domain, typeSymbol }] of Object.entries(SEED_WORLD_ASSET_TYPE_CATALOG)) {
      expect(SEED_WORLD_API_SEARCH_CATALOG).toContain(`| ${kind} | ${domain} | ${typeSymbol} |`);
    }
    expect(SEED_WORLD_API_SEARCH_ENTRIES.some(({ name }) => name.startsWith("__"))).toBe(false);
  });

  it("keeps single trees addressable while grass, flowers and aquatic grass are area assets", () => {
    const tools = new Map(createSeedWorldTools(application).map((tool) => [tool.name, tool]));
    const create = tools.get("vegetation.create")!;
    const update = tools.get("vegetation.update")!;
    const target = {
      anchor: { kind: "viewer" },
      frame: "anchor-local",
      relation: { kind: "front" },
      placement: { snapTo: "terrain", collision: "avoid" }
    };

    expect(() => create.parseInput({
      plant: "shrub",
      distribution: { kind: "area", radiusMetres: 8 },
      target
    })).not.toThrow();
    expect(() => create.parseInput({
      plant: "flower",
      distribution: { kind: "area", radiusMetres: 8 },
      target
    })).not.toThrow();
    expect(() => create.parseInput({
      plant: "flower",
      distribution: { kind: "area", radiusMetres: 8 },
      target: { ...target, relation: { kind: "front", distanceMetres: 8 } }
    })).not.toThrow();
    expect(() => create.parseInput({
      plant: "flower",
      distribution: { kind: "area", radiusMetres: 8 },
      target: { ...target, relation: { kind: "front", distanceMetres: 0.1 } }
    })).toThrow();

    expect(() => create.parseInput({
      plant: "tree",
      distribution: { kind: "single" },
      target
    })).not.toThrow();
    expect(() => create.parseInput({
      plant: "tree",
      distribution: { kind: "area", count: SEED_WORLD_MAXIMUM_EXACT_VEGETATION_INSTANCES + 1 },
      target
    })).toThrow();
    expect(() => create.parseInput({
      plant: "grass",
      distribution: { kind: "single" },
      target
    })).toThrow();
    expect(() => create.parseInput({
      plant: "aquatic-grass",
      distribution: { kind: "area", radiusMetres: 8 },
      target: {
        ...target,
        placement: { snapTo: "water-surface", requireWater: true }
      }
    })).not.toThrow();

    const result = {
      status: "applied",
      transactionId: "tx-4",
      matchedCount: 1,
      createdCount: 0,
      updatedCount: 1,
      deletedCount: 0,
      skippedCount: 0,
      createdRefs: [],
      updatedRefs: [],
      deletedRefs: [],
      refsTruncated: false,
      affectedBounds: null,
      warnings: [],
      resolvedEffect: null,
      reason: null,
      assetRef: { id: "forest-1", domain: "vegetation", kind: "forest", source: "authored" }
    };
    expect(() => update.parseOutput({
      ...result,
      updated: { plant: "tree", assetKind: "forest", realizedPlantCount: 12 }
    })).not.toThrow();
    expect(() => update.parseOutput({
      ...result,
      updated: { plant: "tree", assetKind: "forest" }
    })).toThrow();
    expect(() => update.parseOutput({
      ...result,
      updated: { plant: "grass", assetKind: "grassland", realizedPlantCount: 12 }
    })).toThrow();
  });

  it("models atmosphere channels as partial semantic patches with physical wind speed", () => {
    const tools = new Map(createSeedWorldTools(application).map((tool) => [tool.name, tool]));
    const update = tools.get("atmosphere.update")!;

    expect(() =>
      update.parseInput({
        weatherPreset: "snow",
        atmosphere: { fogIntensity: 0.3 },
        wind: { speedMetresPerSecond: 8 }
      })
    ).not.toThrow();
    expect(() => update.parseInput({ atmosphere: {} })).toThrow();
    expect(() => update.parseInput({ wind: { intensity: 0.8 } })).toThrow();
  });

  it("makes spatial.resolve output directly composable as another API Target", () => {
    const tools = new Map(createSeedWorldTools(application).map((tool) => [tool.name, tool]));
    const resolve = tools.get("spatial.resolve")!;
    const resolvedTarget = {
      anchor: { kind: "position", x: 12, y: 4, z: 20 },
      frame: "world",
      origin: "surface",
      relation: { kind: "at" },
      placement: { snapTo: "none", collision: "allow" }
    };

    expect(resolve.parseOutput(resolvedTarget)).toEqual(resolvedTarget);
    expect(() => resolve.parseOutput({ resolvedTarget })).toThrow();
  });

  it("returns common assets from query and validates exact inspected domain assets", () => {
    const tools = new Map(createSeedWorldTools(application).map((tool) => [tool.name, tool]));
    const query = tools.get("world.query")!;
    const inspect = tools.get("world.inspect")!;
    const input = query.parseInput({
      domains: ["vegetation"],
      kinds: ["tree"],
      spatial: {
        anchor: { kind: "viewer" },
        relation: "in-front-of",
        maxDistanceMetres: 30
      },
      sort: "nearest",
      limit: 1
    });

    expect(input).toMatchObject({ domains: ["vegetation"], kinds: ["tree"] });
    expect(query.parseInput({ ids: ["tree-1"] })).toEqual({ ids: ["tree-1"] });
    expect(query.parseInput({ domains: ["terrain"], sources: ["authored"] })).toEqual({
      domains: ["terrain"],
      sources: ["authored"]
    });
    expect(() => query.parseInput({ kinds: ["tree"], sort: "newest" })).toThrow();
    expect(() =>
      inspect.parseInput({
        ref: { id: "tree-1", domain: "vegetation", kind: "tree", source: "natural", revision: 4 }
      })
    ).toThrow();
    expect(() =>
      query.parseInput({
        filters: [{ field: "ref.source", operator: "eq", value: "authored" }]
      })
    ).toThrow();
    expect(() => query.parseInput({ types: ["object"], kinds: ["tree"] })).toThrow();
    expect(() =>
      query.parseOutput({
        selectionId: "selection-4-1",
        matchedCount: 1,
        offset: 0,
        items: [
          {
            type: "tree",
            ref: { id: "tree-1", domain: "vegetation", kind: "tree", source: "natural" },
            position: [1, 2, 3]
          }
        ]
      })
    ).not.toThrow();
    expect(() =>
      query.parseOutput({
        selectionId: "selection-4-2",
        matchedCount: 1,
        offset: 0,
        items: [
          {
            ref: { id: "tree-2", domain: "vegetation", kind: "tree", source: "natural" },
            position: [1, 2, 3]
          }
        ]
      })
    ).toThrow();
    expect(() =>
      query.parseOutput({
        selectionId: "selection-4-3",
        matchedCount: 1,
        offset: 0,
        items: [
          {
            type: "river",
            ref: { id: "tree-3", domain: "vegetation", kind: "tree", source: "natural" },
            position: [1, 2, 3]
          }
        ]
      })
    ).toThrow();
    expect(() =>
      query.parseOutput({
        selectionId: "selection-4-4",
        matchedCount: 1,
        offset: 0,
        items: [
          {
            type: "tree",
            ref: { id: "tree-4", domain: "vegetation", kind: "tree", source: "natural" },
            properties: { assetKind: "tree" }
          }
        ]
      })
    ).toThrow();
    const parsedTree = inspect.parseOutput({
        type: "tree",
        ref: { id: "tree-1", domain: "vegetation", kind: "tree", source: "natural" },
        position: [1, 2, 3],
        properties: {
          species: "birch",
          footprintMetres: [1, 1],
          headingDegrees: 0,
          scale: [1, 1, 1]
        },
        relations: {}
      }) as { ref: Record<string, unknown> };
    expect(parsedTree).toMatchObject({
      ref: { id: "tree-1", domain: "vegetation", kind: "tree", source: "natural" }
    });
    expect(parsedTree.ref).not.toHaveProperty("revision");
    expect(() =>
      inspect.parseOutput({
        worldRevision: 4,
        item: {
          ref: { id: "tree-1", domain: "vegetation", kind: "tree", source: "natural" },
          properties: {
            assetKind: "tree",
            species: "birch",
            footprintMetres: [1, 1],
            headingDegrees: 0,
            scale: [1, 1, 1]
          }
        },
        relations: {}
      })
    ).toThrow();
    expect(() =>
      inspect.parseOutput({
        type: "pond",
        ref: { id: "pond-1", domain: "water", kind: "pond", source: "authored" },
        position: [1, 2, 3],
        properties: {
          radiusMetres: 20,
          depthMetres: 3,
          shorelineIrregularity: 0.4,
          seed: 1234
        },
        relations: {}
      })
    ).not.toThrow();
    expect(() =>
      inspect.parseOutput({
        type: "tree",
        ref: { id: "tree-2", domain: "vegetation", kind: "tree", source: "natural" },
        position: [1, 2, 3],
        properties: { assetKind: "river", widthMetres: 10 },
        relations: {}
      })
    ).toThrow();
    expect(() =>
      inspect.parseOutput({
        type: "river",
        ref: { id: "tree-3", domain: "vegetation", kind: "tree", source: "natural" },
        position: [1, 2, 3],
        properties: {}
      })
    ).toThrow();
    expect(() =>
      inspect.parseOutput({
        type: "tree",
        ref: { id: "tree-4", domain: "vegetation", kind: "tree", source: "natural" },
        distanceMetres: 6,
        properties: {}
      })
    ).toThrow();
    expect(inspect).not.toHaveProperty("requiredSymbols");
    expect(
      inspect.parseInput({ ref: { id: "tree-1", domain: "vegetation", kind: "tree", source: "natural" } })
    ).toEqual({ ref: { id: "tree-1", domain: "vegetation", kind: "tree", source: "natural" } });
  });

  it("keeps query reference domains consistent with every catalog kind and source", () => {
    const query = createSeedWorldTools(application).find(({ name }) => name === "world.query")!;
    for (const [kind, { domain }] of Object.entries(SEED_WORLD_ASSET_TYPE_CATALOG)) {
      for (const source of ["natural", "authored"]) {
        const result = {
          selectionId: "selection-identity", matchedCount: 1, offset: 0,
          items: [{ type: kind, ref: { id: `test-${kind}`, domain, kind, source } }]
        };
        expect(query.parseOutput(result)).toEqual(result);
        const invalid = structuredClone(result);
        invalid.items[0].ref.domain = (domain === "vegetation" ? "water" : "vegetation") as typeof domain;
        expect(() => query.parseOutput(invalid)).toThrow(/资产类型目录/);
      }
    }
  });

  it("advertises and validates natural-water sRGB color patches independently of geometry", () => {
    const tool = createSeedWorldTools(application).find(({ name }) => name === "water.update")!;
    const ref = { id: "natural:lake:1", domain: "water", kind: "lake", source: "natural" };
    expect(tool.parseInput({ ref, patch: { colorRgb: [0, 0, 0] } })).toMatchObject({ ref, patch: { colorRgb: [0, 0, 0] } });
    for (const colorRgb of [[-1, 0, 0], [256, 0, 0], [1.5, 0, 0], [0, 0], [0, 0, 0, 0], "black"]) {
      expect(() => tool.parseInput({ ref, patch: { colorRgb } })).toThrow();
    }
    expect(() => tool.parseInput({ ref, patch: { colorRgb: [0, 0, 0], radiusMetres: 20 } })).toThrow();
    expect(() => tool.parseInput({ ref, patch: { radiusMetres: 20 } })).toThrow();
    expect(SEED_WORLD_API_SEARCH_CATALOG).toContain("颜色");
  });

  it("makes update eligibility and kind-specific patches executable contract rules", () => {
    const tools = new Map(createSeedWorldTools(application).map((tool) => [tool.name, tool]));
    const terrainCreate = tools.get("terrain.create")!;
    const terrainUpdate = tools.get("terrain.update")!;
    const waterUpdate = tools.get("water.update")!;
    const vegetationUpdate = tools.get("vegetation.update")!;
    const ref = (domain: string, kind: string, source = "authored") => ({
      id: `${domain}-${kind}-1`,
      domain,
      kind,
      source
    });

    const target = {
      anchor: { kind: "position", x: 10, z: 20 },
      relation: { kind: "at" }
    };
    expect(() =>
      terrainCreate.parseInput({
        kind: "hill",
        target,
        pedestalLiftMetres: 40,
        influenceMajorRadiusMetres: 660,
        peakReliefMetres: 76,
        bodyMajorRadiusMetres: 300,
        transitionDurationSeconds: 3
      })
    ).not.toThrow();
    expect(() => terrainCreate.parseInput({ kind: "hill", target, transitionDurationSeconds: 30.1 })).toThrow();
    expect(() => terrainCreate.parseInput({ kind: "hill", target, heightMetres: 40 })).toThrow();
    expect(() =>
      terrainCreate.parseInput({
        kind: "mountain",
        target,
        heightMetres: 40,
        lengthMetres: 200,
        widthMetres: 160
      })
    ).not.toThrow();
    expect(() =>
      terrainCreate.parseInput({
        kind: "mountain",
        target,
        peakReliefMetres: 76
      })
    ).toThrow();

    expect(() =>
      terrainUpdate.parseInput({
        ref: ref("terrain", "mountain", "natural"),
        patch: { elevationDeltaMetres: 20 }
      })
    ).toThrow();
    expect(() =>
      terrainUpdate.parseInput({
        ref: ref("terrain", "hill"),
        patch: { peakReliefMetres: 90 },
        transitionDurationSeconds: 2
      })
    ).not.toThrow();
    expect(() =>
      terrainUpdate.parseInput({
        ref: ref("terrain", "hill"),
        patch: { elevationDeltaMetres: 90 }
      })
    ).toThrow();
    expect(() =>
      terrainUpdate.parseInput({
        ref: ref("terrain", "mountain"),
        patch: { peakReliefMetres: 90 }
      })
    ).toThrow();
    expect(() =>
      waterUpdate.parseInput({
        ref: ref("water", "lake"),
        patch: { flowSpeed: 2 }
      })
    ).toThrow();
    expect(() =>
      waterUpdate.parseInput({
        ref: ref("water", "river"),
        patch: { radiusMetres: 20 }
      })
    ).toThrow();
    expect(() =>
      waterUpdate.parseInput({
        ref: { id: "water-lake-1", domain: "water", kind: "lake", source: "authored" },
        patch: { waterLevelMetres: 39.849 }
      })
    ).not.toThrow();
    expect(() =>
      waterUpdate.parseInput({
        ref: ref("water", "river"),
        patch: { widthMetres: 12, flowSpeed: 2 }
      })
    ).not.toThrow();
    expect(() =>
      vegetationUpdate.parseInput({
        ref: ref("vegetation", "tree"),
        patch: { density: 2 }
      })
    ).toThrow();
    expect(() =>
      vegetationUpdate.parseInput({
        ref: ref("vegetation", "tree"),
        patch: {
          target: {
            anchor: { kind: "viewer" },
            relation: { kind: "offset", forwardMetres: 6, rightMetres: 0 }
          }
        }
      })
    ).not.toThrow();
    expect(() =>
      vegetationUpdate.parseInput({
        ref: ref("vegetation", "forest"),
        patch: { density: 2 }
      })
    ).toThrow();
    expect(() => vegetationUpdate.parseInput({
      ref: ref("vegetation", "forest"), patch: { count: 12 }
    })).not.toThrow();
    expect(() => vegetationUpdate.parseInput({
      ref: ref("vegetation", "grassland"), patch: { count: 40 }
    })).toThrow();
  });

  it("generates independent declaration modules and resolves their real TypeScript import graph", () => {
    const entries = new Map(SEED_WORLD_API_SEARCH_ENTRIES.map((entry) => [entry.name, entry]));
    const modules = new Map(SEED_WORLD_API_DECLARATION_MODULES.map((module) => [module.id, module]));
    const sourceForEntry = (name: string) => modules.get(entries.get(name)!.moduleId)!.source;
    const sourceForType = (name: string) => modules.get(`common/${name}.d.ts`)!.source;
    // Special generic declarations must preserve the executable contract's usage semantics.
    for (const contract of SEED_WORLD_API_CONTRACTS) {
      expect(sourceForEntry(contract.name)).toContain(contract.outputDescription);
    }

    expect(SEED_WORLD_API_SEARCH_CATALOG).toContain("| ocean | water | OceanAsset |");
    expect(SEED_WORLD_API_SEARCH_CATALOG).toContain("| lake | water | LakeAsset |");
    expect(SEED_WORLD_API_SEARCH_CATALOG).not.toContain("用户概念");
    expect(SEED_WORLD_API_SEARCH_CATALOG).toContain("创建池塘、湖泊、溪流或河流资产");
    expect(SEED_WORLD_API_SEARCH_CATALOG).toContain("抽干或排空池塘/湖泊也属于水位更新");
    expect(entries).toHaveProperty("size", 27 + API_NAMES.length);
    expect([...modules.keys()].filter((id) => id.startsWith("assets/"))).toHaveLength(27);
    expect(sourceForEntry("LakeAsset")).toContain("export type LakeAsset");
    expect(sourceForEntry("LakeAsset")).toContain('Asset<"lake">');
    expect(sourceForEntry("LakeAsset")).toContain("interface AssetDetailsByType");
    expect(sourceForEntry("LakeAsset")).not.toContain("assetKind");
    expect(sourceForEntry("LakeAsset")).toContain("import type { Asset }");
    expect(sourceForType("Ref")).not.toContain("revision");
    expect(sourceForEntry("water.create")).toContain("interface WaterApi");
    expect(sourceForEntry("water.create")).toContain("create(input: (");
    expect(modules.get(entries.get("water.create")!.moduleId)?.toolNames).toEqual(["water.create"]);
    expect(sourceForEntry("water.update")).toContain(
      "先读取资产的 minimumWaterLevelMetres，再将 waterLevelMetres 更新为该值"
    );
    expect(sourceForEntry("terrain.create")).toContain("pedestalLiftMetres?: number");
    expect(sourceForEntry("terrain.create")).toContain("influenceMajorRadiusMetres?: number");
    expect(sourceForEntry("terrain.create")).toContain("peakReliefMetres?: number");
    expect(sourceForEntry("terrain.create")).toContain("bodyMajorRadiusMetres?: number");
    expect(sourceForEntry("terrain.create")).toContain("transitionDurationSeconds?: number");
    expect(sourceForEntry("HillAsset")).not.toContain("assetKind");
    expect(sourceForType("Relation")).toContain("用户只说“面前”或“前方”时必须省略并使用默认 20 米");
    expect(sourceForType("Relation")).toContain("用户明确距离时必须原样填写");
    expect(sourceForEntry("vegetation.create")).toContain(
      "created.realizedPlantCount 是树或灌木实际创建的株数"
    );
    expect(sourceForEntry("vegetation.create")).toContain("count?: number");
    expect(sourceForEntry("vegetation.create")).not.toContain("desiredPlantCount");
    expect(sourceForEntry("vegetation.create")).not.toContain("density");
    expect(sourceForEntry("vegetation.create")).not.toContain('kind: "cluster"');
    const inspectSource = sourceForEntry("world.inspect");
    expect(inspectSource).toContain("inspect<T extends AssetKind & keyof AssetDetailsByType>");
    expect(inspectSource).toContain("Promise<AssetDetailsByType[T]>");
    expect(inspectSource).not.toContain("TreeAsset");
    expect(inspectSource).not.toContain("LakeAsset");
    expect(inspectSource).not.toContain("JsonObject");
    expect(sourceForEntry("vegetation.update")).not.toContain("densityPerSquareMetre");
    expect(sourceForEntry("vegetation.update")).not.toContain("分布密度");
    expect(sourceForEntry("vegetation.create")).toContain(
      "也是对外反馈数量的唯一事实来源"
    );
    expect(sourceForEntry("vegetation.create")).toContain("明确提供灌木 count 时会完整创建该数量并允许重叠");
    expect(sourceForEntry("vegetation.create")).toContain("相同位置的重复笔刷会叠加覆盖");
    expect(sourceForEntry("vegetation.update")).toContain("realizedPlantCount: number | null");
    expect(sourceForEntry("vegetation.update")).toContain(
      "update(input: ("
    );
    expect(sourceForEntry("water.create")).toContain(
      "水面代表半径，单位为米；省略时 pond 为 14 米、lake 为 55 米。 取值范围：5 到 500。"
    );
    expect(entries.has("AssetMutationResult")).toBe(false);
    expect(sourceForEntry("atmosphere.get")).toContain("windSpeed: number");
    expect(sourceForEntry("atmosphere.get")).toContain("rainIntensity: number");
    expect(sourceForEntry("atmosphere.get")).toContain("lightningFrequency: number");
    expect(sourceForEntry("atmosphere.get")).not.toContain("environment: JsonObject");
    expect(sourceForType("AssetKind")).toContain('"mountain" | "hill" | "ridge"');
    expect(sourceForType("Ref")).toContain('import type { AssetKind } from "./AssetKind"');
    expect(sourceForType("Ref")).toContain("kind: AssetKind");
    expect(sourceForType("Selector")).toContain("kinds?: Array<AssetKind>");
    expect(sourceForType("Asset")).toContain("type: T");
    expect(sourceForType("Asset")).toContain("ref: Ref & { kind: T; domain: AssetDomainByKind[T] }");
    expect(sourceForType("Asset")).not.toContain("distanceMetres");
    expect(sourceForType("QueriedAsset")).toContain("export type QueriedAsset = Asset &");
    expect(sourceForType("QueriedAsset")).toContain("distanceMetres?: number");

    const inspectClosure = declarationClosure(entries, modules, ["world.inspect"]);
    expect(inspectClosure.filter((id) => id.startsWith("assets/"))).toHaveLength(0);
    const queryClosure = declarationClosure(entries, modules, ["world.query"]);
    expect(queryClosure).toEqual(expect.arrayContaining([
      "common/AgentTools.d.ts",
      "common/Asset.d.ts",
      "common/AssetDomain.d.ts",
      "common/AssetKind.d.ts",
      "common/AssetRelations.d.ts",
      "common/AssetSource.d.ts",
      "common/Bounds.d.ts",
      "common/QueriedAsset.d.ts",
      "common/Ref.d.ts",
      "common/Vec3.d.ts",
      "tools/world.query.d.ts"
    ]));
    expect(queryClosure.filter((id) => id.startsWith("assets/"))).toHaveLength(0);
    expect([...modules.keys()].filter((id) => id.startsWith("common/"))).toHaveLength(20);
    for (const removed of [
      "WorldAssetSummary", "Selection", "WorldQueryInput", "WorldInspectInput",
      "TerrainRef", "WaterRef", "VegetationRef", "ObjectRef", "InfrastructureRef", "PoiRef"
    ]) {
      expect(modules.has(`common/${removed}.d.ts`)).toBe(false);
    }
    const combined = declarationClosure(entries, modules, ["water.create", "world.inspect", "LakeAsset"]);
    expect(combined.filter((id) => id === "assets/LakeAsset.d.ts")).toHaveLength(1);
    expect(combined.filter((id) => id.startsWith("assets/") && id !== "assets/LakeAsset.d.ts")).toHaveLength(0);
  });

  it("keeps Zod parsing private to the runtime boundary", () => {
    for (const tool of createSeedWorldTools(application)) {
      expect(tool.parseInput).toBeTypeOf("function");
      expect(tool.parseOutput).toBeTypeOf("function");
      expect(tool).not.toHaveProperty("inputSchema");
      expect(tool).not.toHaveProperty("outputSchema");
      expect(tool).not.toHaveProperty("description");
    }
  });
});

function declarationClosure(
  entries: ReadonlyMap<string, Readonly<{ moduleId: string }>>,
  modules: ReadonlyMap<string, Readonly<{ imports: readonly string[] }>>,
  roots: readonly string[]
): string[] {
  const visited = new Set<string>();
  const visit = (moduleId: string) => {
    if (visited.has(moduleId)) return;
    visited.add(moduleId);
    const module = modules.get(moduleId);
    if (!module) throw new Error(`Missing declaration module ${moduleId}`);
    for (const importedModuleId of module.imports) visit(importedModuleId);
  };
  for (const root of roots) visit(entries.get(root)!.moduleId);
  return [...visited].sort();
}

it("accepts base terrain identity consistently in query and inspection",()=>{
 const tools=createSeedWorldTools(application), ref={id:"planning:terrain",domain:"terrain",kind:"terrain",source:"natural"};
 const item={type:"terrain",ref};
 expect(()=>tools.find(t=>t.name==="world.query")!.parseOutput({selectionId:"s",matchedCount:1,offset:0,items:[item]})).not.toThrow();
 expect(()=>tools.find(t=>t.name==="world.inspect")!.parseOutput({...item,properties:{planningElementId:"world"}})).not.toThrow();
 expect(()=>tools.find(t=>t.name==="world.query")!.parseOutput({selectionId:"s",matchedCount:1,offset:0,items:[{...item,type:"invented"}]})).toThrow();
});
