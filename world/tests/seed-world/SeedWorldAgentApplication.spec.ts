import { describe, expect, it, vi } from "vitest";
import * as engineDraft from "../../demos/seed-world/agent-adapter/SeedWorldEngineDraft";
import * as heightmaps from "@galacean/engine-world-planning/semantic-study/PlanningHeightmap.ts";
import type { IslandPlan } from "@galacean/engine-world-planning/semantic-study/IslandPlanModel.ts";

import { buildAgentSystemPrompt } from "@galacean/engine-ai-chat/ai-chat/agent-protocol.ts";
import { AgentLoop } from "@galacean/engine-ai-chat/ai-chat/agent-loop.ts";
import { SeedWorldAgentApplication } from "../../demos/seed-world/agent-adapter/SeedWorldAgentApplication";
import { createSeedWorldAgentDefinition } from "../../demos/seed-world/agent-adapter/SeedWorldAgentDefinition";
import { createSeedWorldTools } from "../../demos/seed-world/agent-adapter/SeedWorldToolCatalog";
import * as planningResources from "../../demos/seed-world/agent-adapter/SeedWorldPlanningResources";
import type { SeedWorldPlanningService } from "../../demos/seed-world/agent-adapter/SeedWorldPlanningService";
import type { PlanningSession } from "@galacean/engine-world-planning/spatial/PlanningSession.ts";
import type { SeedWorldAnimalService } from "../../demos/seed-world/agent-adapter/ports/SeedWorldAnimalService";
import { createAgentProjectFiles } from "@galacean/engine-ai-chat/ai-chat/agent-project-files.ts";
import type { RuntimeNativeEditor } from "@galacean/engine-runtime-editor/runtime-editor-agent/runtime-native-editor.ts";
import type {
  SeedWorldAuthoringResource,
  SeedWorldEnginePort,
  SeedWorldLiveState,
  SeedWorldObject,
  SeedWorldResolvedSpatialTarget,
  SeedWorldResourceMutation,
  SeedWorldSpatialTarget,
  SeedWorldVegetationBrushInput
} from "@galacean/engine-world-planning/agent-adapter/ports/SeedWorldEnginePort.ts";

const signal = new AbortController().signal;

const sharedTreeShape = {
  horizontalScale: 1,
  verticalScale: 1,
  yawDegrees: 0,
  branchLengthScale: 1,
  leafDensity: 0.5,
  leafSizeScale: 1,
  trunkThicknessScale: 1,
  branchDensity: 1,
  branchCurvatureDegreesPerMeter: 0,
  leafColorRgb: [64, 128, 192],
  barkColorRgb: [80, 60, 40]
};

describe("SeedWorldAgentApplication final architecture", () => {
  it("refreshes draft navigation after bridge edits and removal without rebuilding between moves", async () => {
    const { engine } = createHarness();
    const plan = { bridges: [{ a: { x: 0, z: 0 }, b: { x: 10, z: 0 }, deckY: 4, width: 3 }] } as IslandPlan;
    const session = { result: { plan } } as PlanningSession;
    const planning = { beginEdit: () => ({ session, discard() {} }) } as unknown as SeedWorldPlanningService;
    const map = vi.spyOn(heightmaps, "planningHeightmap").mockReturnValue({ sample: () => -2 } as unknown as heightmaps.PlanningHeightmap);
    const createDraft = engineDraft.createSeedWorldEngineDraft;
    const factory = vi.spyOn(engineDraft, "createSeedWorldEngineDraft").mockImplementation((base, projection, id, settings) =>
      createDraft(base, { ...projection, teleport: input => ({
        cameraPosition: [input.x, input.heightOffset, input.z], navigationSurfaceHeight: 0
      }) }, id, settings));
    const application = new SeedWorldAgentApplication(engine, planning);
    const edit = application.beginEdit("bridge-navigation", signal);
    const draft = factory.mock.results[0].value as ReturnType<typeof engineDraft.createSeedWorldEngineDraft>;
    const move = () => { draft.port.teleport({ x: 5, z: 0, heightOffset: 1 }); return draft.port.readWorldState()!.camera.position[1]; };
    try {
      expect(move()).toBe(5); expect(move()).toBe(5);
      expect(map).toHaveBeenCalledTimes(1);
      session.result = { ...session.result!, plan: { ...plan, bridges: [{ ...plan.bridges[0], deckY: 8 }] } };
      expect(move()).toBe(9); expect(map).toHaveBeenCalledTimes(2);
      session.result = { ...session.result!, plan: { ...plan, bridges: [] } };
      expect(move()).toBe(-1); expect(map).toHaveBeenCalledTimes(3);
      session.result = { ...session.result!, plan };
      expect(move()).toBe(5); expect(map).toHaveBeenCalledTimes(4);
    } finally {
      await edit.discard(); factory.mockRestore(); map.mockRestore();
    }
  });
  it("retains the latest parameter attempt receipt across execute drafts without replay or cross-session sharing", async () => {
    const { engine } = createHarness();
    const session = { result: undefined } as unknown as PlanningSession;
    const planning = { beginEdit: () => ({ session, before: {}, document: () => ({}),
      hasEdits: () => true, prepare: async () => {}, commit: () => {}, activate: async () => {}, discard: () => {}
    }) } as unknown as SeedWorldPlanningService;
    const apply = vi.fn(async () => ({ status: "accepted", versionToken: "1", changedIds: ["world"], diagnostics: [] }));
    const authoring = (): import("../../demos/seed-world/agent-adapter/tools/parameter-tools").SeedWorldParameterAuthoring => ({
      forSession: () => authoring(), describe: () => [], query: () => [], inspect: () => ({}), apply
    });
    const application = new SeedWorldAgentApplication(engine, planning, undefined, authoring());
    const run = async (edit: ReturnType<SeedWorldAgentApplication["beginEdit"]>, name: string, input: unknown) => {
      const tool = edit.tools.find(tool => tool.name === "world.parameters." + name)!;
      return tool.execute(tool.parseInput(input), { signal }) as Promise<any>;
    };
    const edit = application.beginEdit("parameter-write", signal);
    const input = { commands: [{ op: "set", entity: "world", component: "animals", values: { enabled: false } }], versionToken: "0" };
    const first = await run(edit, "apply", input);
    await edit.prepare(signal); edit.commit(); await edit.activate!(signal);
    const next = application.beginEdit("parameter-read", signal);
    expect(await run(next, "receipt", { receiptId: first.receiptId, section: "changedIds" })).toMatchObject({ items: ["world"] });
    expect(apply).toHaveBeenCalledOnce();
    await next.discard();
    const other = new SeedWorldAgentApplication(engine, planning, undefined, authoring()).beginEdit("other-session", signal);
    await expect(run(other, "receipt", { receiptId: first.receiptId, section: "changedIds" })).rejects.toThrow("Receipt expired");
    await other.discard();
    // Receipts describe attempts, even when the outer editor transaction is discarded.
    // This lets the next execute inspect a rejection without repeating the edit.
    apply.mockResolvedValueOnce({ status: "rejected", versionToken: "1", changedIds: [], diagnostics: [] });
    const rejected = application.beginEdit("rejected-parameter", signal);
    const latest = await run(rejected, "apply", input);
    await rejected.discard();
    const readRejected = application.beginEdit("read-rejected", signal);
    await expect(run(readRejected, "receipt", { receiptId: first.receiptId, section: "changedIds" })).rejects.toThrow("Receipt expired");
    expect(await run(readRejected, "receipt", { receiptId: latest.receiptId, section: "changedIds" })).toMatchObject({ items: [] });
    expect(apply).toHaveBeenCalledTimes(2);
    await readRejected.discard();
    expect(JSON.stringify(application.getEditorDocument())).not.toContain(latest.receiptId);
  });
  it("does not advertise or persist the retired building backend", () => {
    const { engine } = createHarness();
    const application = new SeedWorldAgentApplication(engine);
    const buildingTools = createSeedWorldTools(application).filter((tool) => tool.name.startsWith("building."));
    expect(buildingTools.map((tool) => [tool.name, tool.effect])).toEqual([["building.generate", "read"]]);
    expect(application.getEditorDocument()).not.toHaveProperty("buildings");
  });
  it("keeps native planning resources and live animal reads bound separately in an isolated authoring draft", async () => {
    const { engine } = createHarness();
    const animals: SeedWorldAnimalService = {
      catalog: vi.fn(),
      spawn: vi.fn(),
      query: vi.fn(() => ({ enabled: false, animals: [], matchedCount: 0, offset: 0 })),
      describe: vi.fn(),
      command: vi.fn(),
      receipt: vi.fn()
    };
    const nativeResources = { nativeCatalog: vi.fn(() => ({ assets: [], objects: [] })) };
    const session = { result: undefined } as unknown as PlanningSession;
    const planningDiscard = vi.fn();
    const subjects = {
      beginEdit: () => ({ session, discard: planningDiscard })
    } as unknown as SeedWorldPlanningService;
    const createResourcePort = vi.spyOn(planningResources, "createPlanningResourcePort");
    const application = new SeedWorldAgentApplication(engine, subjects, undefined, undefined, nativeResources, animals);
    const live = createSeedWorldTools(application);
    const edit = application.beginEdit("animal-live-reads", signal);
    try {
      expect(createResourcePort).toHaveBeenCalledExactlyOnceWith(
        expect.anything(),
        session,
        "animal-live-reads",
        nativeResources
      );
      const query = edit.tools.find((tool) => tool.name === "world.animals.query")!;
      expect(await query.execute(query.parseInput({}), { signal })).toMatchObject({ enabled: false, animals: [] });
      expect(animals.query).toHaveBeenCalledExactlyOnceWith({});
      expect(live.find((tool) => tool.name === "world.animals.command")!.effect).toBe("command");
      expect(animals.command).not.toHaveBeenCalled();
    } finally {
      await edit.discard();
      createResourcePort.mockRestore();
    }
    expect(planningDiscard).toHaveBeenCalledOnce();
  });
  it("mounts the native editor project and install sources for Agent read/list discovery", () => {
    const { engine } = createHarness();
    const content: Record<string, string> = {"project.json":"{}", "remote/example/README.md":"Example system", "assets/Notes/README.md":"Local instructions"};
    const provider = {paths: () => Object.keys(content), read: (path: string) => content[path]};
    const nativeEditor = {projectFiles: [provider], tools: []} as unknown as RuntimeNativeEditor;
    const definition = createSeedWorldAgentDefinition(new SeedWorldAgentApplication(engine), nativeEditor);
    const files = createAgentProjectFiles(definition.scriptApi, definition.projectFiles);
    expect(files.list()).toContain("remote/example/README.md");
    expect(files.read("remote/example/README.md")).toBe("Example system");
    expect(files.read("assets/Notes/README.md")).toBe("Local instructions");
  });
  it("keeps additional pick identities available in the isolated editor transaction", async () => {
    const { engine } = createHarness();
    const asset = {
      ref: {
        id: "picked-flower-region",
        domain: "vegetation" as const,
        kind: "flower-field",
        source: "natural" as const
      },
      properties: {}
    };
    const application = new SeedWorldAgentApplication(engine, undefined, () => [asset]);
    const edit = application.beginEdit("picked-edit", signal);
    try {
      const tool = edit.tools.find((tool) => tool.name === "world.query")!;
      const output = await tool.execute(tool.parseInput({ ids: [asset.ref.id], limit: 1 }), { signal });
      expect(output).toMatchObject({
        items: [expect.objectContaining({ ref: expect.objectContaining({ id: asset.ref.id }) })]
      });
    } finally {
      await edit.discard();
    }
  });
  it("keeps user selection separate from model queries and clears it explicitly", () => {
    const { engine } = createHarness();
    const application = new SeedWorldAgentApplication(engine);
    const ref = application.selectWorld({ kinds: ["tree"], limit: 1 }).items[0]!.ref;
    application.setUserSelection(ref);
    expect(application.getUserSelection()).toEqual(ref);
    expect(application.getUserSelection()).not.toBe(ref);
    application.selectWorld({ kinds: ["rock"], limit: 1 });
    expect(application.getUserSelection()).toEqual(ref);
    application.setUserSelection(undefined);
    expect(application.getUserSelection()).toBeNull();
  });

  it("invalidates view state for independently published water and lighting changes", () => {
    const { engine } = createHarness();
    const state = createState();
    engine.readWorldState = vi.fn(() => state);
    const application = new SeedWorldAgentApplication(engine);
    const before = JSON.stringify(application.getViewState());
    Object.assign(state.water, { hostRevision: state.water.hostRevision + 1 });
    const afterWater = JSON.stringify(application.getViewState());
    expect(afterWater).not.toBe(before);
    Object.assign(state.lighting, { iblPublishedRevision: state.lighting.iblPublishedRevision + 1 });
    const afterLighting = JSON.stringify(application.getViewState());
    expect(afterLighting).not.toBe(afterWater);
    Object.assign(state.water, { colors: [{ bodyId: "lake", colorRgb: [255, 0, 0] }] });
    expect(JSON.stringify(application.getViewState())).not.toBe(afterLighting);
  });

  it("binds the APISearch declaration graph to the same runtime APIs", () => {
    const { engine } = createHarness();
    const application = new SeedWorldAgentApplication(engine);
    const tools = createSeedWorldTools(application);
    const definition = createSeedWorldAgentDefinition(application);

    expect(definition.scriptApi.skills?.map((skill) => skill.name)).toContain("world-objects");
    expect(definition.scriptApi.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "LakeAsset", moduleId: "declare/world/assets/LakeAsset.d.ts" }),
        expect.objectContaining({ name: "water.create", moduleId: "declare/world/tools/water.create.d.ts" })
      ])
    );
    expect(definition.scriptApi.modules).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "declare/world/tools/world.inspect.d.ts" })])
    );
    expect(definition.toolNames).toEqual(tools.map(({ name }) => name));
    const initialPrompt = buildAgentSystemPrompt(definition);
    expect(initialPrompt).not.toContain("【应用约束】");
    expect(initialPrompt).not.toContain(definition.scriptApi.catalog);
    expect(initialPrompt).not.toContain("mount/README.md");
    expect(definition.scriptApi.documents?.some((doc) => doc.path.endsWith("mount/README.md"))).toBe(false);
    expect(definition.scriptApi.entries.some((entry) => entry.name === "mount.command")).toBe(false);
    expect(initialPrompt).not.toContain("mount.command");
    expect(initialPrompt).not.toContain("指令已接收；不表示行为或动画已经完成");
    expect(() => new AgentLoop({ tools, definition })).not.toThrow();
  });



  it("updates and inspects natural water colors without terrain mutations, and previews without publication", async () => {
    const { engine } = createHarness();
    let color = [40, 80, 120] as const;
    engine.readWaterColor = vi.fn(() => color);
    engine.updateWaterColor = vi.fn(async (_ref, next) => {
      color = next as typeof color;
      return next;
    });
    const application = new SeedWorldAgentApplication(engine);
    const ref = application.selectWorld({ kinds: ["ocean"], limit: 1 }).items[0]!.ref;
    const tool = createSeedWorldTools(application).find(({ name }) => name === "water.update")!;
    const preview = await tool.execute(
      tool.parseInput({ ref, patch: { colorRgb: [0, 0, 0] }, executionMode: "preview" }),
      { signal }
    );
    expect(preview).toMatchObject({ status: "preview", updatedCount: 0, colorRgb: [0, 0, 0] });
    expect(engine.updateWaterColor).not.toHaveBeenCalled();
    const result = await tool.execute(tool.parseInput({ ref, patch: { colorRgb: [0, 0, 0] } }), { signal });
    expect(result).toMatchObject({
      status: "applied",
      assetRef: expect.objectContaining({ id: ref.id, source: "natural" }),
      updatedCount: 1,
      colorRgb: [0, 0, 0]
    });
    expect(application.inspectWorld(ref)).toMatchObject({ properties: { colorRgb: [0, 0, 0] } });
    expect(application.resolvePickedObject(ref.id)).toEqual({ ref, type: ref.kind });
    expect(engine.mutateWorldResource).not.toHaveBeenCalled();
    expect(engine.mutateWorldResources).not.toHaveBeenCalled();
  });

  it("rejects unpublished, stale, aborted, and failed water color edits without claiming success", async () => {
    const { engine } = createHarness();
    const application = new SeedWorldAgentApplication(engine);
    const ref = application.selectWorld({ kinds: ["ocean"], limit: 1 }).items[0]!.ref;
    const patch = { colorRgb: [0, 0, 0] as const };
    engine.updateWaterColor = vi.fn().mockRejectedValue(new Error("publication failed"));
    await expect(application.updateWaterFeature(ref, patch, {}, signal)).rejects.toThrow("NOT_EDITABLE");
    engine.readWaterColor = vi.fn(() => [40, 80, 120] as const);
    await expect(application.updateWaterFeature({ ...ref, id: "missing" }, patch, {}, signal)).rejects.toThrow(
      "no longer exists"
    );
    await expect(application.updateWaterFeature(ref, patch, { expectedWorldRevision: 999 }, signal)).rejects.toThrow();
    const controller = new AbortController();
    controller.abort();
    await expect(application.updateWaterFeature(ref, patch, {}, controller.signal)).rejects.toThrow("aborted");
    expect(engine.updateWaterColor).not.toHaveBeenCalled();
    await expect(application.updateWaterFeature(ref, patch, {}, signal)).rejects.toThrow("publication failed");
  });

  it("updates one existing shared effect, counts its members, and leaves other effects and recipes untouched", async () => {
    const trees = [naturalTree(0, "a"), naturalTree(1, "b"), naturalTree(2, "c"), naturalTree(3, "d")];
    trees.forEach((tree, index) =>
      Object.assign(tree.properties, {
        treeRecipeId: index === 3 ? "recipe-b" : "recipe-a",
        treeRecipeLabel: "internal label",
        treeEffectIndex: index === 2 ? 2 : 1,
        treeShape: { ...sharedTreeShape }
      })
    );
    const { engine } = createHarness(trees);
    const application = new SeedWorldAgentApplication(engine);
    const ref = application.selectWorld({ kinds: ["tree"], sort: "nearest", limit: 1 }).items[0]!.ref;
    const tool = createSeedWorldTools(application).find(({ name }) => name === "vegetation.update")!;
    const input = tool.parseInput({ ref, patch: { treeShapeScope: "shared-effect", treeShape: { leafDensity: 0.8 } } });
    const result = await tool.execute(input, { signal });
    expect(result).toMatchObject({
      status: "applied",
      matchedCount: 2,
      updatedCount: 2,
      updated: { realizedPlantCount: 2 }
    });
    expect(engine.mutateWorldResource).toHaveBeenCalledWith(
      {
        action: "update",
        resourceType: "tree-variation",
        value: { recipeId: "recipe-a", variationIndex: 0, controls: { leafDensity: 0.8 } }
      },
      signal
    );
    expect(trees.map((tree) => (tree.properties.treeShape as typeof sharedTreeShape).leafDensity)).toEqual([
      0.8, 0.8, 0.5, 0.5
    ]);
  });

  it("previews shared changes without publication and refuses the source slot or an instance-only scope", async () => {
    const tree = naturalTree(0, "a");
    Object.assign(tree.properties, { treeRecipeId: "recipe-a", treeEffectIndex: 1, treeShape: { ...sharedTreeShape } });
    const { engine } = createHarness([tree]);
    const application = new SeedWorldAgentApplication(engine);
    const ref = application.selectWorld({ kinds: ["tree"], limit: 1 }).items[0]!.ref;
    const result = await application.updateVegetation(
      ref,
      { treeShapeScope: "shared-effect", treeShape: { leafDensity: 0.8 } },
      { executionMode: "preview" },
      signal
    );
    expect(result).toMatchObject({
      status: "preview",
      matchedCount: 1,
      updatedCount: 0,
      updated: { realizedPlantCount: null }
    });
    expect(engine.mutateWorldResource).not.toHaveBeenCalled();
    await expect(application.updateVegetation(ref, { treeShape: { leafDensity: 0.8 } }, {}, signal)).rejects.toThrow(
      "shared-effect"
    );
    await expect(
      application.updateVegetation(
        ref,
        { treeShapeScope: "shared-effect", treeEffectIndex: 0, treeShape: { leafDensity: 0.8 } },
        {},
        signal
      )
    ).rejects.toThrow("not editable");
  });

  it("queries natural and authored assets through one index with source and parent relations", () => {
    const { engine } = createHarness();
    const application = new SeedWorldAgentApplication(engine);
    const vegetation = application.selectWorld({ domains: ["vegetation"], sort: "nearest" });
    const water = application.selectWorld({ domains: ["water"], sort: "nearest" });
    const terrain = application.selectWorld({ domains: ["terrain"], kinds: ["mountain"], limit: 1 });

    expect(() =>
      application.selectWorld({
        kinds: ["tree"],
        filters: [{ field: "ref.revision", operator: "eq", value: 4 }]
      })
    ).toThrow(/Unknown WorldAsset filter field 'ref\.revision'/);

    expect(vegetation.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ref: expect.objectContaining({ domain: "vegetation", kind: "tree", source: "natural" }),
          relations: { parent: expect.objectContaining({ kind: "forest", source: "natural" }) }
        }),
        expect.objectContaining({
          ref: expect.objectContaining({ domain: "vegetation", kind: "forest", source: "natural" })
        })
      ])
    );
    expect(water.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ref: expect.objectContaining({ domain: "water", kind: "river", source: "natural" }),
          position: [0, 2, 14]
        }),
        expect.objectContaining({
          ref: expect.objectContaining({ domain: "water", kind: "lake", source: "authored" })
        })
      ])
    );
    const tree = vegetation.items.find(({ ref }) => ref.kind === "tree")!;
    const forest = vegetation.items.find(({ ref }) => ref.kind === "forest")!;
    const river = water.items.find(({ ref }) => ref.kind === "river")!;
    expect(vegetation.items.every((item) => !("properties" in item))).toBe(true);
    expect(vegetation.items.every((item) => item.type === item.ref.kind)).toBe(true);
    const inspectedForest = application.inspectWorld(forest.ref);
    expect(inspectedForest).toMatchObject({
      type: "forest",
      properties: { memberCount: 2 }
    });
    expect(inspectedForest).not.toHaveProperty("item");
    expect(inspectedForest).not.toHaveProperty("worldRevision");
    expect(application.inspectWorld(river.ref)).toMatchObject({
      type: "river",
      properties: { surfaceElevationMetres: 2 }
    });
    expect(application.inspectWorld(terrain.items[0]!.ref)).toMatchObject({
      type: "mountain",
      position: [0, 30, -20],
      properties: { elevationMetres: 30 }
    });
    expect(application.inspectWorld(tree.ref)).toMatchObject({
      type: "tree",
      ref: tree.ref,
      relations: { parent: expect.objectContaining({ kind: "forest" }) }
    });
    const selection = application.getUserSelection();
    const thumbnail = application.getWorldThumbnail() as any;
    for (const item of [tree, forest, river, terrain.items[0]!])
      expect(application.resolvePickedObject(item.ref.id)).toEqual({ ref: item.ref, type: item.ref.kind });
    expect(application.getUserSelection()).toEqual(selection);
    expect(application.getWorldThumbnail()).toEqual({ ...thumbnail, viewer: { ...thumbnail.viewer,
      current: { ...thumbnail.viewer.current, capturedAt: expect.any(String) } } });
  });

  it("updates an authored lake through its absolute water-level contract", async () => {
    const { engine } = createHarness();
    const application = new SeedWorldAgentApplication(engine);
    const lake = application.selectWorld({
      domains: ["water"],
      kinds: ["lake"],
      sources: ["authored"],
      limit: 1
    }).items[0]!;

    await application.updateWaterFeature(lake.ref, { waterLevelMetres: 8 }, {}, signal);
    const updated = application.selectWorld({
      domains: ["water"],
      kinds: ["lake"],
      sources: ["authored"],
      limit: 1
    }).items[0]!;

    expect(application.inspectWorld(updated.ref)).toMatchObject({
      properties: {
        canonicalWaterLevelMetres: 10,
        minimumWaterLevelMetres: 8,
        maximumWaterLevelMetres: 10,
        waterLevelMetres: 8
      }
    });
    expect(engine.mutateWorldResource).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "update",
        resourceType: "water-body",
        patch: { waterLevelMetres: 8 }
      }),
      signal
    );
  });

  it("keeps inside, intersects and near as distinct asset relations", () => {
    const { engine } = createHarness([naturalTree(0, "inside-cell"), naturalTree(10, "edge-cell")]);
    const application = new SeedWorldAgentApplication(engine);
    const authoredLake = { domains: ["water" as const], kinds: ["lake"], sources: ["authored" as const] };

    expect(
      application.selectWorld({
        domains: ["vegetation"],
        kinds: ["tree"],
        relatedTo: [{ selector: authoredLake, relation: "intersects" }]
      })
    ).toMatchObject({ matchedCount: 2 });
    expect(
      application.selectWorld({
        domains: ["vegetation"],
        kinds: ["tree"],
        relatedTo: [{ selector: authoredLake, relation: "inside" }]
      })
    ).toMatchObject({ matchedCount: 1 });
    const lakeRef = application.selectWorld({ ...authoredLake, limit: 1 }).items[0]!.ref;
    expect(
      application.selectWorld({
        domains: ["vegetation"],
        kinds: ["tree"],
        spatial: { anchor: { kind: "world-ref", ref: lakeRef }, relation: "inside" }
      })
    ).toMatchObject({ matchedCount: 1 });
    expect(
      application.selectWorld({
        domains: ["vegetation"],
        kinds: ["tree"],
        spatial: { anchor: { kind: "viewer" }, relation: "inside" }
      })
    ).toMatchObject({ matchedCount: 0 });
    expect(
      application.selectWorld({
        domains: ["water"],
        kinds: ["river"],
        relatedTo: [
          {
            selector: { domains: ["infrastructure"], kinds: ["bridge"] },
            relation: "intersects"
          }
        ]
      })
    ).toMatchObject({ matchedCount: 0 });
    expect(
      application.selectWorld({
        domains: ["water"],
        kinds: ["river"],
        relatedTo: [
          {
            selector: { domains: ["infrastructure"], kinds: ["bridge"] },
            relation: "near",
            maxDistanceMetres: 1
          }
        ]
      })
    ).toMatchObject({ matchedCount: 1 });
  });

  it("keeps Ref identity and saved selections valid across unrelated world revisions", async () => {
    const { engine } = createHarness();
    const application = new SeedWorldAgentApplication(engine);
    const initialSelection = application.selectWorld({
      domains: ["vegetation"],
      kinds: ["tree"],
      sort: "nearest",
      limit: 1
    });
    const originalTreeRef = initialSelection.items[0]!.ref;

    const hill = await application.createTerrainFeature(
      {
        kind: "hill",
        target: viewerOffset(8),
        pedestalLiftMetres: 10,
        influenceMajorRadiusMetres: 300,
        peakReliefMetres: 30,
        bodyMajorRadiusMetres: 100
      },
      signal
    );
    expect(hill.assetRef).toBeDefined();
    expect(originalTreeRef.revision).toBe(3);
    expect(application.inspectWorld(originalTreeRef)).toMatchObject({
      ref: { id: originalTreeRef.id, revision: 4 }
    });

    expect(application.saveSelection(initialSelection.selectionId, "stable-tree")).toMatchObject({
      worldRevision: 4,
      refs: [{ id: originalTreeRef.id, revision: 4 }]
    });
    expect(application.getSelection("stable-tree")).toMatchObject({
      items: [{ ref: { id: originalTreeRef.id, revision: 4 } }]
    });
    expect(application.updateWorldTags([originalTreeRef], ["stable"], [])).toMatchObject({
      results: [{ ref: { id: originalTreeRef.id, revision: 4 }, tags: ["stable"] }]
    });

    await application.createWaterFeature(
      {
        kind: "pond",
        target: viewerOffset(18),
        radiusMetres: 5,
        depthMetres: 2
      },
      signal
    );
    await expect(
      application.updateTerrainFeature(hill.assetRef!, { peakReliefMetres: 35 }, {}, signal)
    ).resolves.toMatchObject({ updatedCount: 1, assetRef: { id: hill.assetRef!.id, revision: 6 } });
  });

  it("creates, queries, updates and deletes authored terrain and water assets", async () => {
    const { engine } = createHarness();
    const application = new SeedWorldAgentApplication(engine);
    const target = viewerOffset(8);

    expect(
      await application.createTerrainFeature(
        {
          kind: "mountain",
          target,
          heightMetres: 24,
          widthMetres: 36,
          lengthMetres: 48
        },
        signal
      )
    ).toMatchObject({
      createdCount: 1,
      createdRefs: [expect.objectContaining({ domain: "terrain", kind: "mountain", source: "authored" })]
    });
    let terrain = application.selectWorld({
      domains: ["terrain"],
      kinds: ["mountain"],
      sources: ["authored"],
      limit: 1
    }).items[0]!;
    await application.updateTerrainFeature(terrain.ref, { elevationDeltaMetres: 31, roughness: 0.7 }, {}, signal);
    terrain = application.selectWorld({
      domains: ["terrain"],
      kinds: ["mountain"],
      sources: ["authored"],
      limit: 1
    }).items[0]!;
    expect(application.inspectWorld(terrain.ref)).toMatchObject({
      type: "mountain",
      properties: { elevationDeltaMetres: 31, roughness: 0.7 }
    });
    expect(await application.deleteWorld({ refs: [terrain.ref] }, signal)).toMatchObject({ deletedCount: 1 });

    expect(
      await application.createWaterFeature(
        {
          kind: "river",
          target,
          lengthMetres: 80,
          widthMetres: 7,
          depthMetres: 2,
          flowSpeed: 1.5,
          meander: 0.4
        },
        signal
      )
    ).toMatchObject({
      createdRefs: [expect.objectContaining({ domain: "water", kind: "river", source: "authored" })]
    });
    let river = application.selectWorld({
      domains: ["water"],
      kinds: ["river"],
      sources: ["authored"],
      limit: 1
    }).items[0]!;
    expect(application.selectWorld({ ids: [river.ref.id] })).toMatchObject({
      matchedCount: 1,
      items: [{ ref: { id: river.ref.id, domain: "water", kind: "river" } }]
    });
    expect(() =>
      application.selectWorld({
        filters: [{ field: "ref.id", operator: "eq", value: river.ref.id }]
      })
    ).toThrow(/use selector\.ids\/domains\/kinds\/sources for identity/);
    await application.updateWaterFeature(river.ref, { widthMetres: 12, flowSpeed: 2.5 }, {}, signal);
    river = application.selectWorld({
      domains: ["water"],
      kinds: ["river"],
      sources: ["authored"],
      limit: 1
    }).items[0]!;
    expect(application.inspectWorld(river.ref)).toMatchObject({
      type: "river",
      properties: { widthMetres: 12, flowSpeed: 2.5 }
    });
    expect(await application.deleteWorld({ refs: [river.ref] }, signal)).toMatchObject({ deletedCount: 1 });
    expect(
      application.selectWorld({
        ids: [river.ref.id],
        domains: ["water"],
        kinds: ["river"]
      }).matchedCount
    ).toBe(0);
  });

  it("exposes the planner single-hill parameters as one authored terrain atom", async () => {
    const { engine } = createHarness();
    const application = new SeedWorldAgentApplication(engine);
    const created = await application.createTerrainFeature(
      {
        kind: "hill",
        target: viewerOffset(8),
        direction: { kind: "heading", degrees: 90 },
        pedestalLiftMetres: 20,
        influenceMajorRadiusMetres: 500,
        peakReliefMetres: 50,
        bodyMajorRadiusMetres: 250,
        transitionDurationSeconds: 2.5
      },
      signal
    );

    expect(created).toMatchObject({
      createdCount: 1,
      assetRef: { domain: "terrain", kind: "hill", source: "authored" },
      resolvedEffect: {
        kind: "hill",
        headingDegrees: 90,
        pedestalLiftMetres: 20,
        influenceMajorRadiusMetres: 500,
        peakReliefMetres: 50,
        bodyMajorRadiusMetres: 250,
        transitionDurationSeconds: 2.5,
        adjustments: []
      }
    });
    expect(engine.mutateWorldResource).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: "create",
        resourceType: "terrain-feature",
        transitionDurationSeconds: 2.5,
        value: expect.objectContaining({
          kind: "hill",
          pedestalLiftMetres: 20,
          influenceMajorRadiusMetres: 500,
          peakReliefMetres: 50,
          bodyMajorRadiusMetres: 250,
          bodyMinorRadiusMetres: expect.any(Number),
          influenceMinorRadiusMetres: expect.any(Number)
        })
      }),
      signal
    );
    expect(application.inspectWorld(created.assetRef!)).toMatchObject({
      type: "hill",
      properties: {
        pedestalLiftMetres: 20,
        influenceMajorRadiusMetres: 500,
        peakReliefMetres: 50,
        bodyMajorRadiusMetres: 250,
        headingDegrees: 90
      }
    });

    const updated = await application.updateTerrainFeature(
      created.assetRef!,
      { peakReliefMetres: 90 },
      { transitionDurationSeconds: 1.5 },
      signal
    );
    expect(updated).toMatchObject({
      updatedCount: 1,
      resolvedEffect: {
        kind: "hill",
        peakReliefMetres: 90,
        transitionDurationSeconds: 1.5,
        adjustments: [expect.objectContaining({ parameter: "bodyMajorRadiusMetres", reason: "body-support" })]
      }
    });
    expect(engine.mutateWorldResource).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: "update",
        resourceType: "terrain-feature",
        transitionDurationSeconds: 1.5
      }),
      signal
    );
    expect(application.inspectWorld(updated.assetRef!)).toMatchObject({
      type: "hill",
      properties: {
        peakReliefMetres: 90,
        bodyMajorRadiusMetres: expect.any(Number)
      }
    });
  });

  it("uses the one-second transition default for authored terrain features", async () => {
    const { engine } = createHarness();
    const application = new SeedWorldAgentApplication(engine);

    const created = await application.createTerrainFeature(
      {
        kind: "hill",
        target: viewerOffset(8)
      },
      signal
    );

    expect(created.resolvedEffect).toMatchObject({ transitionDurationSeconds: 1 });
    expect(engine.mutateWorldResource).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: "create",
        resourceType: "terrain-feature",
        transitionDurationSeconds: 1
      }),
      signal
    );
  });

  it("uses a default 20m horizontal front target and preserves an explicit distance", async () => {
    const { engine, setCamera } = createHarness();
    const application = new SeedWorldAgentApplication(engine);
    setCamera({ mode: "roam", position: [10, 50, 10], forward: [3, -12, 4] });
    // Even a contradictory world frame cannot turn the semantic "front" relation into a world-axis offset.
    const target = {
      ...viewerFront(),
      frame: "world" as const,
      placement: {
        snapTo: "terrain" as const,
        collision: "avoid" as const,
        avoidWater: true,
        maxSlope: 0
      }
    };

    expect(application.resolveSpatialTarget({ ...target, placement: { snapTo: "terrain" } })).toMatchObject({
      anchor: { kind: "position", x: 22, y: 0, z: 26 },
      relation: { kind: "at" }
    });
    expect(application.resolveSpatialTarget(viewerFront(8))).toMatchObject({
      anchor: { kind: "position", x: 14.8, y: 0, z: 16.4 },
      relation: { kind: "at" }
    });

    await application.createVegetation(
      { plant: "shrub", distribution: { kind: "area", radiusMetres: 8 }, target },
      signal
    );
    await application.createVegetation(
      { plant: "flower", distribution: { kind: "area", radiusMetres: 8 }, target },
      signal
    );
    await application.createVegetation(
      { plant: "grass", distribution: { kind: "area", radiusMetres: 8 }, target },
      signal
    );

    expect(engine.mutateWorldResource).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        resourceType: "vegetation-brush",
        value: expect.objectContaining({ category: "shrub", x: 22, z: 26 })
      }),
      signal
    );
    expect(engine.mutateWorldResource).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        resourceType: "vegetation-brush",
        value: expect.objectContaining({ category: "flower", x: 22, z: 26 })
      }),
      signal
    );
    expect(engine.mutateWorldResource).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        resourceType: "vegetation-brush",
        value: expect.objectContaining({ category: "grass", x: 22, z: 26 })
      }),
      signal
    );
    expect(engine.queryWorldObjects).not.toHaveBeenCalled();
  });

  it("models one tree as an atomic asset and a forest as one aggregate asset", async () => {
    const { engine } = createHarness();
    const application = new SeedWorldAgentApplication(engine);
    const target = viewerOffset(6);
    const tree = await application.createVegetation(
      {
        plant: "tree",
        distribution: { kind: "single" },
        target
      },
      signal
    );
    expect(tree).toMatchObject({
      createdCount: 1,
      createdRefs: [expect.objectContaining({ domain: "vegetation", kind: "tree", source: "authored" })],
      assetRef: expect.objectContaining({ domain: "vegetation", kind: "tree", source: "authored" }),
      created: {
        plant: "tree",
        assetKind: "tree",
        distribution: "single",
        requestedPlantCount: 1,
        realizedPlantCount: 1
      }
    });
    const movedTree = await application.updateVegetation(
      tree.assetRef!,
      { target: viewerOffset(10), seed: 42 },
      {},
      signal
    );
    expect(movedTree.assetRef).toMatchObject({ id: tree.assetRef!.id, kind: "tree", source: "authored" });
    expect(movedTree.updated).toEqual({ plant: "tree", assetKind: "tree", realizedPlantCount: 1 });
    expect(application.inspectWorld(movedTree.assetRef!)).toMatchObject({
      type: "tree",
      ref: { id: tree.assetRef!.id },
      position: [2, expect.any(Number), 14],
      properties: {
        species: "birch",
        footprintMetres: [2, 2],
        headingDegrees: 0,
        scale: [1, 1, 1]
      }
    });

    const countedForest = await application.createVegetation(
      {
        plant: "tree",
        distribution: { kind: "area", count: 3, radiusMetres: 12 },
        target
      },
      signal
    );
    expect(countedForest).toMatchObject({
      createdCount: 1,
      assetRef: expect.objectContaining({ domain: "vegetation", kind: "forest", source: "authored" }),
      created: {
        plant: "tree",
        assetKind: "forest",
        distribution: "area",
        requestedPlantCount: 3,
        realizedPlantCount: 3
      }
    });
    const vegetationCreateTool = createSeedWorldTools(application).find(({ name }) => name === "vegetation.create")!;
    const publicCreateResult = await vegetationCreateTool.execute(
      vegetationCreateTool.parseInput({
        plant: "tree",
        distribution: { kind: "single" },
        target
      }),
      { signal }
    );
    expect(() => vegetationCreateTool.parseOutput(publicCreateResult)).not.toThrow();
    const countedForestMembers = application
      .selectWorld({
        domains: ["vegetation"],
        kinds: ["tree"],
        sources: ["authored"],
        limit: 16
      })
      .items.filter(({ relations }) => relations?.parent?.id === countedForest.assetRef!.id);
    expect(countedForestMembers).toHaveLength(3);
    expect(application.inspectWorld(countedForest.assetRef!)).toMatchObject({
      type: "forest",
      properties: { memberCount: 3, distribution: "area" }
    });
    const resizedCountedForest = await application.updateVegetation(
      countedForest.assetRef!,
      { count: 4, radiusMetres: 16 },
      {},
      signal
    );
    expect(resizedCountedForest.updated).toEqual({
      plant: "tree",
      assetKind: "forest",
      realizedPlantCount: 4
    });
    expect(engine.mutateWorldResource).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: "update",
        resourceType: "vegetation-brush",
        patch: expect.objectContaining({ requestedPlantCount: 4, radiusMetres: 16 })
      }),
      signal
    );

    const forest = await application.createVegetation(
      {
        plant: "tree",
        distribution: { kind: "area", radiusMetres: 12 },
        target
      },
      signal
    );
    expect(forest).toMatchObject({
      createdCount: 1,
      createdRefs: [expect.objectContaining({ domain: "vegetation", kind: "forest", source: "authored" })],
      assetRef: expect.objectContaining({ domain: "vegetation", kind: "forest", source: "authored" }),
      created: {
        plant: "tree",
        assetKind: "forest",
        distribution: "area",
        realizedPlantCount: 5
      }
    });
    let forestAsset = application.selectWorld({
      ids: [forest.assetRef!.id],
      domains: ["vegetation"],
      kinds: ["forest"],
      sources: ["authored"],
      limit: 1
    }).items[0]!;
    const resizedForest = await application.updateVegetation(
      forestAsset.ref,
      { count: 8, radiusMetres: 18 },
      {},
      signal
    );
    expect(resizedForest.updated).toEqual({ plant: "tree", assetKind: "forest", realizedPlantCount: 8 });
    forestAsset = application.selectWorld({
      ids: [forest.assetRef!.id],
      domains: ["vegetation"],
      kinds: ["forest"],
      sources: ["authored"],
      limit: 1
    }).items[0]!;
    expect(application.inspectWorld(forestAsset.ref)).toMatchObject({
      properties: { radiusMetres: 18, distribution: "area" }
    });

    const grassland = await application.createVegetation(
      {
        plant: "grass",
        distribution: { kind: "area", radiusMetres: 9 },
        target
      },
      signal
    );
    const expandedGrassland = await application.updateVegetation(grassland.assetRef!, { radiusMetres: 14 }, {}, signal);
    expect(expandedGrassland.updated).toEqual({
      plant: "grass",
      assetKind: "grassland",
      realizedPlantCount: null
    });
    expect(await application.deleteWorld({ refs: [forestAsset.ref] }, signal)).toMatchObject({ deletedCount: 1 });
  });

  it("uses an exact single-tree target even when placement preferences request collision or habitat checks", async () => {
    const { engine } = createHarness();
    const application = new SeedWorldAgentApplication(engine);
    const target = {
      anchor: { kind: "position" as const, x: -20, y: 0, z: 1030 },
      relation: { kind: "at" as const },
      placement: { snapTo: "terrain" as const, collision: "avoid" as const, avoidWater: true, maxSlope: 0 }
    };
    const created = await application.createVegetation(
      { plant: "tree", distribution: { kind: "single" }, target },
      signal
    );
    expect(engine.mutateWorldResource).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceType: "vegetation-brush",
        value: expect.objectContaining({ x: -20, z: 1030, distributionKind: "single" })
      }),
      signal
    );
    const moved = { ...target, anchor: { ...target.anchor, x: 2, z: 4 } };
    await application.updateVegetation(created.assetRef!, { target: moved }, {}, signal);
    expect(engine.mutateWorldResource).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: "update",
        resourceId: created.assetRef!.id,
        patch: expect.objectContaining({ x: 2, z: 4 })
      }),
      signal
    );
    expect(engine.queryWorldObjects).not.toHaveBeenCalled();
  });

  it("uses a representable Terrain Patch radius and rejects sub-lattice precision claims", async () => {
    const { engine } = createHarness();
    const application = new SeedWorldAgentApplication(engine);
    const minimumRadiusMetres = 4 * Math.SQRT2;

    await expect(
      application.applyTerrainPatch(
        {
          operation: "raise",
          target: viewerOffset(8),
          amount: { heightDeltaMetres: 4 }
        },
        signal
      )
    ).resolves.toMatchObject({ matchedCount: 1 });
    expect(engine.mutateWorldResource).toHaveBeenLastCalledWith(
      expect.objectContaining({
        resourceType: "terrain-patch",
        value: expect.objectContaining({ radiusMetres: minimumRadiusMetres, heightDeltaMetres: 4 })
      }),
      signal
    );

    await expect(
      application.applyTerrainPatch(
        {
          operation: "raise",
          target: viewerOffset(8),
          radiusMetres: 5,
          amount: { heightDeltaMetres: 4 }
        },
        signal
      )
    ).rejects.toThrow(/cannot preserve its requested centre height/);
    expect(engine.mutateWorldResource).toHaveBeenCalledTimes(1);
  });

  it("executes unbounded mutation selectors without leaking every Ref", async () => {
    const treeCount = 300;
    const { engine } = createHarness(
      Array.from({ length: treeCount }, (_, index) =>
        naturalTree(index, `cell-${Math.floor(index / 2)}-${"x".repeat(120)}`)
      )
    );
    const application = new SeedWorldAgentApplication(engine);
    const pages = [];
    let offset: number | undefined = 0;
    do {
      const page = application.selectWorld({
        domains: ["vegetation"],
        kinds: ["tree"],
        offset,
        limit: 256
      });
      pages.push(page);
      expect(new TextEncoder().encode(JSON.stringify(page)).byteLength).toBeLessThan(64 * 1024);
      offset = page.nextOffset;
    } while (offset !== undefined);
    expect(pages[0]).toMatchObject({ matchedCount: treeCount, offset: 0, pageLimitedByBytes: true });
    expect(pages.length).toBeGreaterThan(1);
    expect(new Set(pages.flatMap(({ items }) => items).map(({ ref }) => ref.id)).size).toBe(treeCount);
    const result = await application.deleteWorld(
      {
        selector: { domains: ["vegetation"], kinds: ["tree"] }
      },
      signal
    );

    expect(engine.mutateWorldResources).toHaveBeenCalledOnce();
    expect(vi.mocked(engine.mutateWorldResources).mock.calls[0]![0]).toHaveLength(treeCount);
    expect(result).toMatchObject({ matchedCount: treeCount, deletedCount: treeCount, refsTruncated: true });
    expect(result.deletedRefs).toHaveLength(64);
  });

  it("never reports a skipped natural feature deletion as success", async () => {
    const { engine } = createHarness();
    const application = new SeedWorldAgentApplication(engine);
    const naturalRiver = application.selectWorld({
      domains: ["water"],
      kinds: ["river"],
      sources: ["natural"],
      limit: 1
    }).items[0]!;

    await expect(application.deleteWorld({ refs: [naturalRiver.ref] }, signal)).rejects.toMatchObject({
      name: "AgentToolExecutionError",
      code: "NOT_EDITABLE",
      retryable: false,
      executed: false,
      details: {
        skippedRefs: [
          {
            id: naturalRiver.ref.id,
            domain: naturalRiver.ref.domain,
            kind: naturalRiver.ref.kind,
            source: naturalRiver.ref.source
          }
        ],
        refsTruncated: false
      }
    });

    expect(engine.mutateWorldResource).not.toHaveBeenCalled();
    expect(engine.mutateWorldResources).not.toHaveBeenCalled();
  });

  it("retains a nonempty read-only selection across drafts without changing the authoring document",async()=>{
    const {engine}=createHarness();
    const application=new SeedWorldAgentApplication(engine),before=application.getEditorDocument();
    const draft=application.beginEdit("query",signal),tool=draft.tools.find(t=>t.name==="world.query")!;
    const result=tool.parseOutput(await tool.execute(tool.parseInput({kinds:["tree"]}),{signal})) as any;
    expect(result.items.length).toBeGreaterThan(0);
    expect(draft.hasChanges()).toBe(false);
    draft.completeRead!();
    draft.discard();
    const next = application.beginEdit("read-selection",signal);
    const get = next.tools.find(t=>t.name==="world.selection.get")!;
    const selected = get.parseOutput(await get.execute(get.parseInput({nameOrSelectionId:result.selectionId}),{signal})) as any;
    expect(selected.items.map((i:any)=>i.ref)).toEqual(result.items.map((i:any)=>i.ref));
    next.completeRead!();
    next.discard();
    expect(application.getEditorDocument()).toEqual(before);
  });

  it("accepting query observations cannot overwrite authoring changed while the query was open",async()=>{
    const {engine}=createHarness();
    const application=new SeedWorldAgentApplication(engine),draft=application.beginEdit("query",signal);
    const tool=draft.tools.find(t=>t.name==="world.query")!;
    const result=tool.parseOutput(await tool.execute(tool.parseInput({kinds:["tree"]}),{signal})) as any;
    application.updateWorldTags([result.items[0].ref],["UI edit"],[]);
    const edited=application.getEditorDocument();
    draft.completeRead!();
    draft.discard();
    expect(application.getEditorDocument()).toEqual(edited);
    expect(application.getSelection(result.selectionId).items.length).toBeGreaterThan(0);
  });

  it("checks exact points once and returns explicit matches and failed conditions", async () => {
    const { engine } = createHarness();
    vi.mocked(engine.queryWorldPoints).mockReturnValue({samples:[
      {insideWorld:true,height:2,slope:0.1,moisture:0.5,water:false,riverDistanceMetres:10,roadDistanceMetres:20},
      {insideWorld:true,height:1,slope:0.5,moisture:0.5,water:true,waterSurfaceElevationMetres:8,riverDistanceMetres:0,roadDistanceMetres:10},
      {insideWorld:false}
    ]});
    const application = new SeedWorldAgentApplication(engine);
    const tool = createSeedWorldTools(application).find(t=>t.name==="spatial.check")!;
    const positions=[{x:1,z:2},{x:3,z:4},{x:5000,z:5000}];
    const input=tool.parseInput({positions,constraints:{water:false,maximumSlopeDegrees:10}});
    const result=tool.parseOutput(await tool.execute(input,{signal}));
    expect(result).toMatchObject({items:[
      {position:positions[0],matches:true,failedConstraints:[],surface:{slopeDegrees:9,elevationMetres:2}},
      {position:positions[1],matches:false,failedConstraints:expect.arrayContaining(["water","maximumSlopeDegrees"]),surface:{elevationMetres:8}},
      {position:positions[2],matches:false,failedConstraints:["outside_world"],surface:null}
    ]});
    expect(engine.queryWorldPoints).toHaveBeenCalledExactlyOnceWith({mode:"sample",positions,sampleDistance:1});
    expect(()=>tool.parseInput({positions:Array(33).fill(positions[0])})).toThrow();
    vi.mocked(engine.queryWorldPoints).mockReturnValue({samples:[]});
    await expect(tool.execute(input,{signal})).rejects.toThrow("unavailable");
  });

  it("does not turn a river distance into an all-water distance in check or search results", async () => {
    const { engine } = createHarness();
    const samples = [
      { insideWorld: true, height: 2, slope: 0.1, moisture: 0, water: false, riverDistanceMetres: 476, roadDistanceMetres: 20 },
      { insideWorld: true, height: 1, slope: 0.1, moisture: 0, water: true, waterSurfaceElevationMetres: 8, riverDistanceMetres: 460, roadDistanceMetres: 20 }
    ];
    const positions = [{ x: 80, z: 900 }, { x: 50, z: 900 }];
    vi.mocked(engine.queryWorldPoints).mockReturnValueOnce({ samples }).mockReturnValueOnce({
      points: samples.map((sample, i) => ({ ...sample, elevation: sample.height,
        position: [positions[i].x, sample.height, positions[i].z] })),
      matchedPointCount: 2
    });
    const application = new SeedWorldAgentApplication(engine);
    const tools = createSeedWorldTools(application);
    for (const [name, input] of [
      ["spatial.check", { positions }],
      ["spatial.search", { sort: "nearest", limit: 2, spacingMetres: 2 }]
    ] as const) {
      const tool = tools.find(t => t.name === name)!;
      const result = tool.parseOutput(await tool.execute(tool.parseInput(input), { signal })) as any;
      // Water exists 30m away even though the river-only measurement is 476m.
      expect(result.items.map((item: any) => item.surface)).toMatchObject([
        { water: false, riverDistanceMetres: 476, nearestWaterDistanceMetres: null },
        { water: true, riverDistanceMetres: 460, nearestWaterDistanceMetres: null }
      ]);
      const invalid = structuredClone(result);
      invalid.items[0].surface.nearestWaterDistanceMetres = 476;
      expect(() => tool.parseOutput(invalid)).toThrow();
    }
  });

  it("converts spatial slope degrees at the normalized engine boundary", () => {
    const { engine } = createHarness();
    const application = new SeedWorldAgentApplication(engine);
    const result = application.searchSpatial({
      constraints: { minimumSlopeDegrees: 9, maximumSlopeDegrees: 45 },
      sort: "nearest",
      limit: 1,
      spacingMetres: 2
    }) as any;
    expect(engine.queryWorldPoints).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ minimumSlope: 0.1, maximumSlope: 0.5 })
      })
    );
    expect(result.items[0].surface.slopeDegrees).toBe(90);
    application.searchSpatial({ constraints: { maximumSlopeDegrees: 0 }, sort: "nearest", limit: 1, spacingMetres: 2 });
    expect(engine.queryWorldPoints).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ minimumSlope: undefined, maximumSlope: 0 })
      })
    );
  });

  it("keeps derived locations real-time and teleport as the only pose mutation", () => {
    const { engine } = createHarness();
    const application = new SeedWorldAgentApplication(engine);
    const locations = application.searchSpatial({
      constraints: { water: true },
      sort: "nearest",
      limit: 1,
      spacingMetres: 2
    }) as any;
    expect(locations).toMatchObject({
      computedAtRevision: 3,
      matchedCount: 1,
      items: [{ computedAtRevision: 3, surface: { water: true } }]
    });
    expect(JSON.stringify(locations)).not.toContain("ref");

    const resolved = application.resolveSpatialTarget(viewerOffset(5)) as any;
    expect(resolved).toMatchObject({
      anchor: { kind: "position", x: 2, y: 0, z: 9 },
      relation: { kind: "at" },
      placement: { snapTo: "none", collision: "allow" }
    });
    expect(resolved).not.toHaveProperty("expectedWorldRevision");
    expect(engine.teleport).not.toHaveBeenCalled();
    application.teleport({ target: resolved, heightOffset: 2 });
    expect(engine.teleport).toHaveBeenCalledWith({ x: 2, z: 9, heightOffset: 2 });
  });

  it("freezes viewer-relative targets without freezing current model context", async () => {
    const { engine, setCamera } = createHarness();
    const application = new SeedWorldAgentApplication(engine);
    const definition = createSeedWorldAgentDefinition(application);
    const submitted = { ...application.getViewerSnapshot(), capturedAt: "2026-11-04T09:30:00.000Z" };
    const release = application.captureTaskViewerSnapshot(submitted, "input-1");

    const queryViewer = () => application.selectWorld({ kinds: ["tree"], sort: "nearest",
      spatial: {anchor: {kind: "viewer"}, relation: "near"}, limit: 1 }).items[0]!;
    const originalQuery = queryViewer();
    setCamera({ mode: "roam", position: [20, 12, 4], forward: [1, 0, 0] });
    expect(application.resolveSpatialTarget(viewerOffset(5))).toMatchObject({
      anchor: { kind: "position", x: 2, y: 0, z: 9 }
    });
    expect(application.getWorldContext()).toMatchObject({
      camera: { position: [20, 12, 4], forward: [1, 0, 0] }
    });
    expect(queryViewer().distanceMetres).toBe(originalQuery.distanceMetres);
    application.searchSpatial({sort: "nearest", limit: 1, spacingMetres: 2});
    expect(engine.queryWorldPoints).toHaveBeenLastCalledWith(expect.objectContaining({
      nearestTo: {x: submitted.position[0], z: submitted.position[2]}
    }));
    expect(await definition.provideWorldThumbnail!()).toMatchObject({
      viewer: { atSubmission: { ...submitted, inputId: "input-1" },
        current: { mode: "roam", position: [20, 12, 4], forward: [1, 0, 0], capturedAt: expect.any(String) } }
    });

    setCamera({ mode: "roam", position: [30, 18, 6], forward: [0, 0, -1] });
    expect(await definition.provideWorldThumbnail!()).toMatchObject({
      viewer: { current: { mode: "roam", position: [30, 18, 6], forward: [0, 0, -1] } }
    });
    expect(application.resolveSpatialTarget(viewerOffset(5))).toMatchObject({
      anchor: { kind: "position", x: 2, y: 0, z: 9 }
    });

    expect((application.getWorldThumbnail() as any).viewer.atSubmission).toEqual({ ...submitted, inputId: "input-1" });
    release();
    expect((application.getWorldThumbnail() as any).viewer.atSubmission).toBeNull();
    const latestQuery = queryViewer();
    expect(latestQuery.distanceMetres).toBeCloseTo(Math.hypot(latestQuery.position![0] - 30, latestQuery.position![2] - 6));
    expect(application.resolveSpatialTarget(viewerOffset(5))).toMatchObject({
      anchor: { kind: "position", x: 30, y: 0, z: 1 }
    });
    expect(await definition.provideWorldThumbnail!()).toMatchObject({
      viewer: { current: { mode: "roam", position: [30, 18, 6], forward: [0, 0, -1] } }
    });
    const supplement = application.getViewerSnapshot();
    const releaseSupplement = application.captureTaskViewerSnapshot(supplement, "input-2");
    setCamera({ mode: "roam", position: [80, 12, 4], forward: [1, 0, 0] });
    release(); // Releasing an old input must not clear the new input's reference.
    expect((application.getWorldThumbnail() as any).viewer).toMatchObject({
      atSubmission: { ...supplement, inputId: "input-2" }, current: { position: [80, 12, 4] }
    });
    expect(application.resolveSpatialTarget(viewerOffset(5))).toMatchObject({
      anchor: { kind: "position", x: 30, y: 0, z: 1 }
    });
    releaseSupplement();
  });

  it("reads the published viewer through an existing draft without changing the instruction anchor", async () => {
    const { engine, setCamera } = createHarness();
    const application = new SeedWorldAgentApplication(engine);
    const release = application.captureTaskViewerSnapshot();
    const edit = application.beginEdit("read-live-viewer", signal);
    const viewer = edit.tools.find(tool => tool.name === "spatial.viewer")!;
    const resolve = edit.tools.find(tool => tool.name === "spatial.resolve")!;
    try {
      setCamera({ mode: "roam", position: [20, 12, 4], forward: [1, 0, 0] });
      const live = viewer.parseOutput(await viewer.execute(viewer.parseInput({}), { signal }));
      expect(live).toMatchObject({ source: "published", position: [20, 12, 4], forward: [1, 0, 0] });
      expect(await resolve.execute(resolve.parseInput(viewerOffset(5)), { signal })).toMatchObject({
        anchor: { kind: "position", x: 2, z: 9 }
      });
      expect(edit.hasChanges()).toBe(false);
    } finally { await edit.discard(); release(); }
    const releaseNext = application.captureTaskViewerSnapshot();
    try {
      expect(application.resolveSpatialTarget(viewerOffset(5))).toMatchObject({
        anchor: { kind: "position", x: 25, z: 4 }
      });
    } finally { releaseNext(); }
  });

  it.each([
    { forward: [0, 0, -1], heading: 0, pitch: 0, axis: "-Z" },
    { forward: [1, 0, 0], heading: 90, pitch: 0, axis: "+X" },
    { forward: [0, 0, 1], heading: 180, pitch: 0, axis: "+Z" },
    { forward: [-1, 0, 0], heading: 270, pitch: 0, axis: "-X" },
    { forward: [1, 1, 1], heading: 135, pitch: 35.26438968, axis: "+X" },
    { forward: [-1, -1, 1], heading: 225, pitch: -35.26438968, axis: "-X" },
    { forward: [0, 1, 0], heading: null, pitch: 90, axis: null },
    { forward: [0, 0, 0], heading: null, pitch: null, axis: null }
  ])("reports heading, pitch and closest axis consistently for $forward", async ({ forward, heading, pitch, axis }) => {
    const { engine, setCamera } = createHarness();
    const application = new SeedWorldAgentApplication(engine);
    setCamera({ mode: "roam", position: [20, 12, 4], forward: forward as [number, number, number] });
    const viewer = createSeedWorldTools(application).find(tool => tool.name === "spatial.viewer")!;
    const result = viewer.parseOutput(await viewer.execute(viewer.parseInput({}), { signal })) as any;
    expect(result.headingDegrees).toBe(heading);
    if (pitch === null) expect(result.pitchDegrees).toBeNull();
    else expect(result.pitchDegrees).toBeCloseTo(pitch, 6);
    expect(result.nearestHorizontalAxis).toBe(axis);
    expect(result.forward).toEqual(forward);
    expect(engine.teleport).not.toHaveBeenCalled();
  });

  it("updates time and atmosphere as orthogonal continuous state", async () => {
    const { engine } = createHarness();
    const application = new SeedWorldAgentApplication(engine);
    await application.updateTime(
      {
        timeHours: 20,
        season: "winter",
        transitionDuration: 1,
        waitForIbl: true
      },
      signal
    );
    expect(application.getTime()).toMatchObject({ timeHours: 20, season: "winter" });
    await application.updateAtmosphere(
      {
        weatherPreset: "storm",
        wind: { speedMetresPerSecond: 8, directionDegrees: 45, gustiness: 0.7, turbulence: 0.6 },
        transitionDuration: 1,
        waitForIbl: true
      },
      signal
    );
    expect(application.getAtmosphere()).toMatchObject({
      environment: { precipitation: "rain", windSpeed: 8, windDirectionDegrees: 45 }
    });
  });
});

function viewerFront(distanceMetres?: number) {
  return {
    anchor: { kind: "viewer" as const },
    frame: "anchor-local" as const,
    origin: "feet" as const,
    relation: { kind: "front" as const, ...(distanceMetres === undefined ? {} : { distanceMetres }) },
    placement: { snapTo: "terrain" as const }
  };
}

function viewerOffset(forwardMetres: number) {
  return {
    anchor: { kind: "viewer" as const },
    frame: "anchor-local" as const,
    origin: "feet" as const,
    relation: { kind: "offset" as const, forwardMetres, rightMetres: 0 },
    placement: { snapTo: "terrain" as const }
  };
}

function createHarness(initialObjects: SeedWorldObject[] = [naturalTree(0, "forest-a"), naturalTree(1, "forest-a")]) {
  let revision = 3;
  let serial = 0;
  let liveState = createState();
  const resources: SeedWorldAuthoringResource[] = [
    {
      resourceType: "water-body",
      resourceId: "authored-lake-1",
      contentHash: hashFor(3),
      properties: {
        kind: "lake",
        x: 8,
        z: 12,
        radiusMetres: 6,
        depthMetres: 2,
        shorelineIrregularity: 0.3,
        canonicalWaterLevelMetres: 10,
        minimumWaterLevelMetres: 8,
        maximumWaterLevelMetres: 10,
        waterLevelMetres: 10,
        seed: 1
      }
    }
  ];
  const objects = [...initialObjects];
  const removed = new Set<string>();

  const realizeVegetation = (resourceId: string, value: SeedWorldVegetationBrushInput): number => {
    if (value.category !== "tree" && value.category !== "shrub") {
      throw new Error(`Fake discrete vegetation cannot realize '${value.category}' instances`);
    }
    for (let index = objects.length - 1; index >= 0; index--) {
      const source = objects[index]!.source;
      if (source.kind === "authoring" && source.sourceId === resourceId) objects.splice(index, 1);
    }
    const realizedPlantCount =
      value.distributionKind === "area"
        ? Math.max(1, Math.floor((value.requestedPlantCount ?? 10) * 0.5))
        : (value.requestedPlantCount ?? 1);
    for (let index = 0; index < realizedPlantCount; index++) {
      objects.push({
        worldId: "seed-world-1729",
        objectId: `population:${resourceId}:${value.category}:${index}`,
        objectKind: value.category,
        worldRevision: revision,
        position: [value.x + index, 0, value.z],
        footprintMetres: [2, 2],
        source: { kind: "authoring", sourceId: resourceId },
        properties: {
          ...(value.category === "tree" ? { treeSpeciesProfileKey: "birch" } : {}),
          yawRadians: 0,
          scale: [1, 1, 1]
        }
      });
    }
    return realizedPlantCount;
  };

  const mutate = async (mutations: readonly Readonly<SeedWorldResourceMutation>[]) => {
    revision += 1;
    const results = mutations.map((mutation) => {
      if (mutation.resourceType === "tree-variation") {
        const { recipeId, variationIndex, controls } = mutation.value;
        for (const object of objects) {
          if (object.properties.treeRecipeId === recipeId && object.properties.treeEffectIndex === variationIndex + 1) {
            Object.assign(object.properties, {
              treeShape: { ...(object.properties.treeShape as object), ...controls }
            });
          }
        }
        return {
          action: mutation.action,
          resourceType: mutation.resourceType,
          resourceId: JSON.stringify([recipeId, variationIndex])
        };
      }
      if (mutation.action === "create") {
        const resourceId =
          mutation.resourceType === "object-removal" ? mutation.value.objectId : `${mutation.resourceType}-${++serial}`;
        const resource = createFakeAuthoringResource(mutation, resourceId, hashFor(revision));
        let realizedPlantCount: number | undefined;
        if (mutation.resourceType === "object-removal") removed.add(resourceId);
        else {
          resources.push(resource);
          if (
            mutation.resourceType === "vegetation-brush" &&
            (mutation.value.category === "tree" || mutation.value.category === "shrub")
          ) {
            realizedPlantCount = realizeVegetation(resourceId, mutation.value);
          }
        }
        return {
          action: mutation.action,
          resourceType: mutation.resourceType,
          resourceId,
          resource,
          ...(realizedPlantCount !== undefined ? { realizedPlantCount } : {})
        };
      }
      const index = resources.findIndex(({ resourceId }) => resourceId === mutation.resourceId);
      const previous = resources[index];
      if (!previous) throw new Error(`Missing fake resource '${mutation.resourceId}'`);
      if (mutation.action === "delete") {
        resources.splice(index, 1);
        return { action: mutation.action, resourceType: mutation.resourceType, resourceId: mutation.resourceId };
      }
      const resource = updateFakeAuthoringResource(previous, mutation, hashFor(revision));
      resources[index] = resource;
      const realizedPlantCount =
        resource.resourceType === "vegetation-brush" &&
        (resource.properties.category === "tree" || resource.properties.category === "shrub")
          ? realizeVegetation(resource.resourceId, resource.properties)
          : undefined;
      return {
        action: mutation.action,
        resourceType: mutation.resourceType,
        resourceId: mutation.resourceId,
        resource,
        ...(realizedPlantCount !== undefined ? { realizedPlantCount } : {})
      };
    });
    return {
      transactionId: `tx-${revision}`,
      action: mutations.length === 1 ? mutations[0]!.action : "batch",
      results,
      authoring: { activeRevision: revision, acceptedDraftRevision: revision, authoringStateHash: hashFor(revision) }
    };
  };

  const engine: SeedWorldEnginePort = {
    readWorldState: vi.fn(() => liveState),
    readAuthoringSnapshot: vi.fn(() => ({
      activeRevision: revision,
      draftRevision: revision,
      authoringStateHash: hashFor(revision),
      resources: [...resources],
      removedObjectIds: [...removed]
    })),
    queryWorldPoints: vi.fn((input) =>
      input.mode === "sample"
        ? { samples: input.positions.map(() => ({ water: false, slope: 2 })) }
        : {
            inspectedPointCount: 256,
            matchedPointCount: 1,
            points: [
              {
                position: [3, 2, 14],
                elevation: 2,
                slope: 1,
                moisture: 0.9,
                water: true,
                riverDistanceMetres: 0,
                roadDistanceMetres: 15
              }
            ]
          }
    ),
    queryWorldRegions: vi.fn((kind) => ({ features: regionFeatures(kind) })),
    queryWorldObjects: vi.fn((input) => ({
      worldId: "seed-world-1729",
      worldRevision: revision,
      inspectedObjectCount: objects.length,
      objects: objects
        .filter(({ objectId }) => !removed.has(objectId))
        .filter(({ objectKind }) => input.kinds.includes(objectKind))
        .filter((object) => {
          const spatial = input.spatial;
          if (!spatial || spatial.anchor.kind !== "position") return true;
          return (
            Math.hypot(object.position[0] - spatial.anchor.x, object.position[2] - spatial.anchor.z) <=
            (spatial.maximumDistanceMetres ?? Number.POSITIVE_INFINITY)
          );
        })
        .slice(0, input.limit)
    })),
    getWorldObject: vi.fn((id) => {
      const object = objects.find(({ objectId }) => objectId === id && !removed.has(id));
      if (!object) throw new Error(`Missing fake object '${id}'`);
      return object;
    }),
    resolveSpatialTarget: vi.fn((target: Readonly<SeedWorldSpatialTarget>): SeedWorldResolvedSpatialTarget => {
      const x = target.anchor.kind === "position" ? target.anchor.x : 2;
      const z = target.anchor.kind === "position" ? target.anchor.z : 4;
      return {
        geometry: target.relation.kind === "around" ? "area" : "point",
        position: [x, 0, z],
        radiusMetres: target.relation.kind === "around" ? target.relation.radiusMetres : undefined,
        anchor: { kind: target.anchor.kind },
        relation: target.relation,
        worldRevision: revision
      };
    }),
    readTerrainPatchConstraints: vi.fn(() => ({
      heightSampleSpacingMetres: 2,
      minimumRadiusMetres: 2 * Math.SQRT2 * 2
    })),
    teleport: vi.fn(({ x, z, heightOffset }) => ({ cameraPosition: [x, heightOffset, z] })),
    updateEnvironment: vi.fn(async (input) => {
      const environment = { ...liveState.environment };
      if (input.season) environment.season = input.season;
      if (input.weatherPreset === "storm")
        Object.assign(environment, {
          precipitation: "rain",
          rainIntensity: 1,
          cloudCoverage: 1,
          lightningFrequency: 0.65,
          lightningIntensity: 1
        });
      if (input.wind)
        Object.assign(environment, {
          windSpeed: input.wind.speedMetresPerSecond ?? environment.windSpeed,
          windDirectionDegrees: input.wind.directionDegrees ?? environment.windDirectionDegrees,
          windGustiness: input.wind.gustiness ?? environment.windGustiness,
          windTurbulence: input.wind.turbulence ?? environment.windTurbulence
        });
      liveState = {
        ...liveState,
        lighting: { ...liveState.lighting, timeHours: input.timeHours ?? liveState.lighting.timeHours },
        environment
      };
      return { requested: { ...input }, state: liveState };
    }),
    mutateWorldResource: vi.fn((mutation) => mutate([mutation])),
    previewTreeVariationEdit: vi.fn(() => ({ minimum: [0, 0, 0] as const, maximum: [20, 20, 20] as const })),
    mutateWorldResources: vi.fn((mutations) => mutate(mutations)),

  };
  return {
    engine,
    resources,
    objects,
    setCamera(camera: SeedWorldLiveState["camera"]) {
      liveState = { ...liveState, camera };
    }
  };
}

function createFakeAuthoringResource(
  mutation: Extract<SeedWorldResourceMutation, { action: "create" }>,
  resourceId: string,
  contentHash: string
): SeedWorldAuthoringResource {
  switch (mutation.resourceType) {
    case "terrain-patch":
      return { resourceType: "terrain-patch", resourceId, contentHash, properties: { ...mutation.value } };
    case "terrain-feature":
      return { resourceType: "terrain-feature", resourceId, contentHash, properties: { ...mutation.value } };
    case "water-body":
      return {
        resourceType: "water-body",
        resourceId,
        contentHash,
        properties: {
          ...mutation.value,
          canonicalWaterLevelMetres: 10,
          minimumWaterLevelMetres: 10 - mutation.value.depthMetres,
          maximumWaterLevelMetres: 10,
          waterLevelMetres: 10
        }
      };
    case "river":
      return { resourceType: "river", resourceId, contentHash, properties: { ...mutation.value } };
    case "vegetation-brush":
      return { resourceType: "vegetation-brush", resourceId, contentHash, properties: { ...mutation.value } };
    case "object-removal": {
      const { objectId: _, ...properties } = mutation.value;
      return { resourceType: "object-removal", resourceId, contentHash, properties };
    }
  }
}

function updateFakeAuthoringResource(
  previous: SeedWorldAuthoringResource,
  mutation: Exclude<Extract<SeedWorldResourceMutation, { action: "update" }>, { resourceType: "tree-variation" }>,
  contentHash: string
): SeedWorldAuthoringResource {
  switch (mutation.resourceType) {
    case "terrain-feature":
      if (previous.resourceType !== "terrain-feature") throw fakeResourceTypeError(previous, mutation);
      return { ...previous, contentHash, properties: { ...previous.properties, ...mutation.patch } };
    case "water-body":
      if (previous.resourceType !== "water-body") throw fakeResourceTypeError(previous, mutation);
      return { ...previous, contentHash, properties: { ...previous.properties, ...mutation.patch } };
    case "river":
      if (previous.resourceType !== "river") throw fakeResourceTypeError(previous, mutation);
      return { ...previous, contentHash, properties: { ...previous.properties, ...mutation.patch } };
    case "vegetation-brush":
      if (previous.resourceType !== "vegetation-brush") throw fakeResourceTypeError(previous, mutation);
      return { ...previous, contentHash, properties: { ...previous.properties, ...mutation.patch } };
  }
}

function fakeResourceTypeError(
  previous: SeedWorldAuthoringResource,
  mutation: Extract<SeedWorldResourceMutation, { action: "update" }>
): Error {
  return new Error(
    `Fake resource '${previous.resourceId}' is '${previous.resourceType}', not '${mutation.resourceType}'.`
  );
}

function naturalTree(index: number, sourceId: string): SeedWorldObject {
  return {
    worldId: "seed-world-1729",
    objectId: `population:tree:${index}`,
    objectKind: "tree",
    worldRevision: 3,
    position: [4 + index, 0, 8],
    footprintMetres: [2, 2],
    source: { kind: "population", sourceId },
    properties: { treeSpeciesProfileKey: index % 2 ? "oak" : "birch", yawRadians: 0, scale: [1, 1, 1] }
  };
}

function regionFeatures(kind: string): readonly Record<string, unknown>[] {
  if (kind === "summit") return [{ id: "summit-1", position: [0, 30, -20], elevation: 30 }];
  if (kind === "river")
    return [
      {
        id: "river-1",
        surfacePosition: [0, 2, 14],
        surfaceElevationMetres: 2,
        maximumWidthMetres: 8,
        maximumDepthMetres: 2,
        pointCount: 20
      }
    ];
  if (kind === "ocean") return [{ id: "ocean-1", position: [-30, 0, 0], surfaceElevationMetres: 0 }];
  if (kind === "road")
    return [{ id: "road-1", start: [-10, 0, 0], fromPoiId: "poi-1", toPoiId: "poi-2", pointCount: 8, bridgeCount: 1 }];
  if (kind === "bridge")
    return [
      { id: "bridge-1", position: [0, 2, 14], roadId: "road-1", startArcMetres: 10, endArcMetres: 20, lengthMetres: 10 }
    ];
  if (kind === "poi") return [{ id: "poi-1", position: [-10, 0, 0], poiKind: "lookout" }];
  if (kind === "grassland") return [{ id: "grass-1", density: 1, seed: 7 }];
  if (kind === "flower-field") return [{ id: "flowers-1", density: 0.8, seed: 8 }];
  return [];
}

function createState(): SeedWorldLiveState {
  return {
    world: { rootSeed: 1729, sizeMetres: 100 },
    camera: { mode: "roam", position: [2, 12, 4], forward: [0, 0, 1] },
    plan: { summitCount: 1, riverReachCount: 1, roadCount: 1, poiCount: 1 },
    population: {
      residentCellCount: 1,
      residentAcceptedCounts: { tree: 2, shrub: 0, flower: 1, grass: 1 },
      submittedCounts: { tree: 2, shrub: 0, flower: 1, grass: 1 }
    },
    decorations: { rocks: 0, smallRocks: 0, mushrooms: 0, lotus: 0 },
    water: { ready: true, visible: true, bodyCount: 3, chunkCount: 3, hostRevision: 3 },
    lighting: {
      timeHours: 10,
      phase: "day",
      playing: false,
      iblPhase: "idle",
      iblProgress: 1,
      iblPublishedRevision: 3,
      iblBakingEnabled: true
    },
    environment: {
      season: "summer",
      seasonTransitionProgress: 1,
      precipitation: "none",
      rainIntensity: 0,
      snowIntensity: 0,
      cloudCoverage: 0.2,
      fogIntensity: 0,
      windSpeed: 1,
      windIntensity: 0.2,
      windDirectionDegrees: 0,
      windGustiness: 0.1,
      windTurbulence: 0.2,
      lightningFrequency: 0,
      lightningIntensity: 0
    }
  };
}

function hashFor(value: number): string {
  return value.toString(16).padStart(64, "0").slice(-64);
}

it("queries the published native vegetation catalog and re-resolves it after scene replacement", () => {
  const { engine } = createHarness();
  const ref = { id: "landscape:native-tree", domain: "vegetation" as const, kind: "tree", source: "natural" as const };
  let published = [
    {
      ref,
      position: [2, 3, 4] as const,
      properties: { assetKind: "tree", proceduralAssetId: "native-birch", planningEntityId: ref.id }
    }
  ];
  engine.readVegetationAssets = () => published;
  const application = new SeedWorldAgentApplication(engine);
  const query = application.selectWorld({ kinds: ["tree"] });
  expect(query.matchedCount).toBe(1);
  expect(query.items[0].ref.id).toBe(ref.id);
  const detail = application.inspectWorld(ref);
  expect(detail.properties.proceduralAssetId).toBe("native-birch");
  const inspect = createSeedWorldTools(application).find((tool) => tool.name === "world.inspect")!;
  expect(inspect.parseOutput(detail)).toMatchObject({ properties: { planningEntityId: ref.id } });
  published = [];
  expect(application.selectWorld({ kinds: ["tree"] }).matchedCount).toBe(0);
  expect(() => application.inspectWorld(ref)).toThrow("no longer exists");
});

it("forwards water edit policy and rejects simple basin edits before calling the engine", async () => {
  const { engine } = createHarness();
  const application = new SeedWorldAgentApplication(engine);
  const ref = application.selectWorld({ domains: ["water"], kinds: ["lake"], sources: ["authored"], limit: 1 }).items[0].ref;
  const edit = { mode: "simple" as const, affectTerrain: false, rebuildShoreVegetation: false };
  await application.updateWaterFeature(ref, { waterLevelMetres: 8 }, { edit }, signal);
  expect(engine.mutateWorldResource).toHaveBeenCalledWith(expect.objectContaining({ resourceType: "water-body", patch: { waterLevelMetres: 8 } }), signal, edit);
  vi.mocked(engine.mutateWorldResource).mockClear();
  await expect(application.updateWaterFeature(ref, { depthMetres: 3 }, { edit }, signal)).rejects.toThrow("TERRAIN_CHANGE_REQUIRED");
  expect(engine.mutateWorldResource).not.toHaveBeenCalled();
});


it("validates planned building inspection through the public tool without inventing authored-design properties", async () => {
  const { engine } = createHarness();
  const ref = { id: "planned-house", domain: "infrastructure" as const, kind: "building", source: "natural" as const };
  const application = new SeedWorldAgentApplication(engine, undefined, () => [{ ref, properties: { assetKind: "building", planningElementId: ref.id } }]);
  const inspect = createSeedWorldTools(application).find(tool => tool.name === "world.inspect")!;
  const result = await inspect.execute(inspect.parseInput({ ref }), { signal });
  expect(inspect.parseOutput(result)).toMatchObject({ ref, properties: { planningElementId: ref.id } });
  expect(application.resolvePickedObject(ref.id)).toEqual({ ref, type: "building" });
  expect(() => inspect.parseOutput({ ...result as object, properties: {} })).toThrow();
  expect(() => inspect.parseOutput({ ...result as object, ref: { ...ref, source: "authored" } })).toThrow();
});


it("reports left/right from the frozen viewer basis in every heading", async () => {
 const {viewerRelativePosition}=await import("../../demos/seed-world/agent-adapter/ViewerRelation");
 expect(viewerRelativePosition([0,0,0],[0,0,1],[2,0,-3],true)).toMatchObject({basis:"instruction-viewer",direction:"behind-left",rightMetres:-2,forwardMetres:-3});
 expect(viewerRelativePosition([0,0,0],[1,0,0],[0,0,2],false)).toMatchObject({basis:"live-viewer",direction:"right",rightMetres:2});
 expect(viewerRelativePosition([0,0,0],[0,0,-1],[2,0,0],true).direction).toBe("right");
});

it("returns animal direction through the public query using the same task viewer as world assets", async () => {
  const { engine, setCamera } = createHarness();
  const animals: SeedWorldAnimalService = {
    catalog: vi.fn(), spawn: vi.fn(), describe: vi.fn(), command: vi.fn(), receipt: vi.fn(),
    query: vi.fn(() => ({ enabled: true, matchedCount: 1, offset: 0,
      animals: [{id: "cow-1", typeId: "cow", speciesId: "cattle", label: "Cow", loaded: true, visible: true, position: [3, 0, 0] as [number, number, number]}] }))
  };
  const application = new SeedWorldAgentApplication(engine, undefined, undefined, undefined, undefined, animals);
  const release = application.captureTaskViewerSnapshot({mode: "roam", position: [0, 0, 0], forward: [0, 0, 1], capturedAt: "2026-11-05T00:00:00.000Z"});
  setCamera({mode: "roam", position: [-10, 0, 0], forward: [1, 0, 0]});
  const query = createSeedWorldTools(application).find(tool => tool.name === "world.animals.query")!;
  const read = async () => query.parseOutput(await query.execute(query.parseInput({}), {signal}));
  expect(await read()).toMatchObject({animals: [{viewerRelation: {basis: "instruction-viewer", direction: "left", rightMetres: -3}}]});
  release();
  expect(await read()).toMatchObject({animals: [{viewerRelation: {basis: "live-viewer", direction: "front", forwardMetres: 13}}]});
});

it("merges picked and published vegetation identities before counting and pagination, retaining authoritative properties", () => {
 const {engine}=createHarness();
 const ref={id:"same-tree",domain:"vegetation",kind:"tree",source:"natural"} as const;
 engine.readVegetationAssets=()=>[{ref,position:[1,2,3],properties:{assetKind:"tree",proceduralAssetId:"real",headingDegrees:20}}];
 const app=new SeedWorldAgentApplication(engine,undefined,()=>[
   {ref,position:[99,99,99],properties:{assetKind:"tree",planningEntityId:"same-tree",headingDegrees:0}},
   {ref,properties:{assetKind:"tree",planningEntityId:"same-tree"}}
 ]);
 const result=app.selectWorld({domains:["vegetation"],kinds:["tree"],ids:["same-tree"],limit:1});
 expect(result.matchedCount).toBe(1);expect(result.nextOffset).toBeUndefined();
 expect(result.items[0].position).toEqual([1,2,3]);
 expect(app.inspectWorld(ref).properties).toMatchObject({proceduralAssetId:"real",planningEntityId:"same-tree",headingDegrees:20});
});
