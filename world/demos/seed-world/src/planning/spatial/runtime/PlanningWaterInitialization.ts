import { createWaterQualitySettings } from "@galacean/engine-water/water/native/WaterQualitySettings";
import { BUILTIN_WATER_PROJECT_URL } from "@galacean/engine-water/water/native/WaterBuiltinAssets";
import { RuntimeProjectEdit } from "@galacean/engine-project/runtime-editor/project/runtime-project-edit";
import { nativeAssetFormats } from "@galacean/engine-runtime-editor/project/runtime-native-formats";
import type { RuntimeProjectPackage } from "@galacean/engine-project/runtime-editor/project/runtime-project";
import type { PlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningDocument";
import type { IslandPlan } from "@galacean/engine-world-planning/semantic-study/IslandPlanModel";
import { planningSeed } from "@galacean/engine-world-planning/spatial/PlanningLayoutScope";
import { LAKE_DEFAULTS } from "@galacean/engine-world-planning/spatial/hydrology/LakeRegions";
import { RIVER_DEFAULTS } from "@galacean/engine-world-planning/spatial/hydrology/RiverRegions";
import { RuntimeSceneEdit } from "@galacean/engine-runtime-editor/runtime-editor/scene/runtime-scene-edit";
import { planningOceanRepresentation } from "@galacean/engine-world-planning/semantic-study/PlanningOceanSource";
import type { RuntimeEditPreparation } from "@galacean/engine-runtime-editor/runtime-editor/runtime-editor";
import { planningWaterFrame, planningWaterSourceId, transformPlanningWater } from "../PlanningWaterSource.ts";
import type { WaterSourceAuthoring } from "@galacean/engine-world-planning/spatial/runtime/NativeWaterEditor";

export const waterInitializationPath = (scene: string) => `${scene}.water-authoring.json`;
interface WaterInitialization {
  version: 1;
  seeds: Record<string, string[]>;
  /** Explicit native removals; initialization alone does not prove deletion intent. */
  removed?: Record<string, string[]>;
}

/** Native creation joins the existing planning owner in the same public author transaction. */
export const preparePlanningWaterSource =
  (readBefore: () => RuntimeProjectPackage): RuntimeEditPreparation =>
  async (edit) => {
    await edit.run(({ draft, edited }) => {
      const scene = new RuntimeSceneEdit(draft, draft.preview().project.scene);
      const owner = scene.queryComponents({ type: "PlanningProjectAuthoring" })[0];
      if (!owner) return;
      const before = readBefore(),
        previousScene = new RuntimeSceneEdit(new RuntimeProjectEdit(before, nativeAssetFormats(() => ({}))), before.project.scene),
        previousBodies = previousScene.queryComponents({ type: "WaterBodyComponent" }),
        previous = new Set(previousBodies.map(body => body.id));
      const bodies = scene.queryComponents({ type: "WaterBodyComponent" });
      const current = new Set(bodies.map(body => body.id));
      const removed = previousBodies.filter(body => !current.has(body.id)).flatMap(body => {
        const input = previousScene.readComponent(body.id).props?.authoring as unknown as WaterSourceAuthoring | undefined;
        const id = planningWaterSourceId(previousScene, body.entityId);
        return input?.terrain.mode === "host" && id ? [id] : [];
      });
      if (removed.length) {
        const world = previousScene.queryComponents({ type: "PlanningEntityAuthoring" })
          .find(identity => previousScene.readComponent(identity.id).props?.planningId === "world");
        const components = world && previousScene.readComponent(world.id).props?.spatialComponents as
          { world?: { values?: { seed?: number } } } | undefined;
        const seed = components?.world?.values?.seed;
        if (!Number.isSafeInteger(seed)) throw new Error("Water removal requires the planning seed.");
        const state = waterInitialization(draft.preview());
        state.removed ??= {};
        state.removed[String(seed)] = [...new Set([...(state.removed[String(seed)] ?? []), ...removed])];
        draft.writeDocument(waterInitializationPath(draft.preview().project.scene), JSON.stringify(state));
        edited();
      }
      const labels = bodies.flatMap((body) => {
        const identity = scene.queryComponents({ entityId: body.entityId, type: "PlanningEntityAuthoring" })[0];
        return identity && !body.id.startsWith("@instance:")
          ? [scene.readComponent(identity.id).props?.planningId]
          : [];
      });
      let oceans = 0;
      for (const body of bodies) {
        const input = scene.readComponent(body.id).props?.authoring as unknown as WaterSourceAuthoring | undefined;
        if (input?.terrain.mode !== "host") continue;
        if (scene.queryComponents({ entityId: body.entityId, type: "WaterBodyComponent" }).length !== 1)
          throw new Error(`Seed World Water '${body.id}' requires its own author Entity.`);
        const frame = planningWaterFrame(scene, body.entityId);
        transformPlanningWater(input.shape, frame);
        if (input.shape.kind === "ocean" && input.shape.waterLevel !== 0)
          throw new Error(
            "NOT_SUPPORTED: Seed World Ocean uses datum 0; edit the explicit Ocean surface layout instead."
          );
        if (
          input.shape.kind === "ocean" &&
          frame.active &&
          scene.readComponent(body.id).props?.enabled !== false &&
          ++oceans > 1
        )
          throw new Error("NOT_SUPPORTED: A Scene supports one active Ocean.");
        const identity = scene.queryComponents({ entityId: body.entityId, type: "PlanningEntityAuthoring" })[0];
        if (identity) {
          const label = scene.readComponent(identity.id).props?.planningId;
          if (
            !previous.has(body.id) &&
            !body.id.startsWith("@instance:") &&
            labels.filter((id) => id === label).length > 1
          ) {
            scene.updateComponent(identity.id, { planningId: `${input.shape.kind}:authored:${body.id}` });
            edited();
          }
          continue;
        }
        const planningId = input.shape.kind === "ocean" ? "planning-ocean" : `${input.shape.kind}:authored:${body.id}`;
        scene.addComponent(body.entityId, {
          type: "PlanningEntityAuthoring",
          props: { planningId, spatialComponents: {}, parentId: "world" }
        });
        scene.reparent(body.entityId, owner.entityId, true);
        edited();
      }
    });
  };

export function waterInitialization(pack: RuntimeProjectPackage): WaterInitialization {
  const content = pack.documents?.[waterInitializationPath(pack.project.scene)];
  if (content === undefined) return { version: 1, seeds: {} };
  const value = JSON.parse(content);
  if (
    value?.version !== 1 ||
    !value.seeds ||
    Object.values(value.seeds).some((ids) => !Array.isArray(ids) || ids.some((id) => typeof id !== "string")) ||
    (value.removed !== undefined && (!value.removed || typeof value.removed !== "object" || Array.isArray(value.removed) ||
      Object.values(value.removed).some(ids => !Array.isArray(ids) || ids.some(id => typeof id !== "string"))))
  )
    throw new Error("Invalid Water authoring initialization state");
  return value;
}

/** Convert generated suggestions once. Subsequent solves consume the native shape and retain human changes. */
export function initializePlanningWater(
  draft: RuntimeProjectEdit,
  document: PlanningDocument,
  plan: IslandPlan
): PlanningDocument {
  const next = structuredClone(document),
    state = waterInitialization(draft.preview());
  const seed = String(planningSeed(document)),
    known = new Set(state.seeds[seed] ?? []),
    removed = new Set(state.removed?.[seed] ?? []);
  for (const water of plan.waters) {
    const existing = next.entities[water.id];
    const component = water.kind === "lake" ? "lakes" : "rivers";
    if (!["lake", "river"].includes(water.kind) || removed.has(water.id) ||
      (known.has(water.id) && existing?.components[component])) continue;
    if (water.kind === "lake" && water.lake) {
      const shape = water.lake;
      next.entities[water.id] = {
        ...existing,
        id: water.id,
        name: existing?.name ?? water.label,
        parent: existing?.parent ?? "world",
        origin: existing?.origin ?? "generated",
        components: {
          ...existing?.components,
          lakes: {
            base: { entity: "world", component: "lakes" },
            values: {
              ...existing?.components.lakes?.values,
              referenceLevel: shape.referenceLevel,
              levelOffsetM: shape.waterLevel - shape.referenceLevel,
              depthM: shape.depthM,
              bankWidthM: water.bankWidthM ?? LAKE_DEFAULTS.bankWidthM,
              allowCarving: shape.carved,
              radiusM: shape.radiusM,
              offsetX: 0,
              offsetZ: 0,
              enabled: true,
              shoreline: [water.outline, ...(shape.holes ?? [])].flatMap((ring, index) =>
                ring.map((point, i) => ({
                  id: `${water.id}:shore:${index}:${i}`,
                  ring: index ? `island-${index}` : "shore",
                  ...point
                }))
              )
            }
          }
        }
      };
    } else if (water.kind === "river" && water.course) {
      next.entities[water.id] = {
        ...existing,
        id: water.id,
        name: existing?.name ?? water.label,
        parent: existing?.parent ?? "world",
        origin: existing?.origin ?? "generated",
        components: {
          ...existing?.components,
          rivers: {
            base: { entity: "world", component: "rivers" },
            values: {
              ...existing?.components.rivers?.values,
              enabled: true,
              bankWidthM: water.bankWidthM ?? RIVER_DEFAULTS.bankWidthM,
              speed: water.flowSpeed ?? 1,
              points: water.course.points.map(({ id, x, z, elevation, width, depth }) => ({
                id,
                x,
                z,
                elevation,
                width,
                depth
              })),
              sections: water.course.sections.map((section) => ({ ...section }))
            }
          }
        }
      };
    } else continue;
    known.add(water.id);
  }
  state.seeds[seed] = [...known];
  draft.writeDocument(waterInitializationPath(draft.preview().project.scene), JSON.stringify(state));
  return next;
}

/** Only explicit native removal suppresses generation; a legacy reset could also lose initialized objects. */
export function retainRemovedWater(document: PlanningDocument, pack: RuntimeProjectPackage): PlanningDocument {
  const state = waterInitialization(pack), seed = String(planningSeed(document));
  const removed = new Set(state.removed?.[seed] ?? []);
  // Legacy component removal leaves the original author identity. Synthetic
  // tombstones for a lost subtree had no origin and do not prove a native removal.
  for (const id of state.seeds[seed] ?? []) if (document.entities[id]?.origin) removed.add(id);
  for (const id of removed) {
    if (id === "planning-ocean") continue;
    const component = id.startsWith("lake:") ? "lakes" : "rivers";
    if (document.entities[id]?.components[component]) continue;
    const existing = document.entities[id];
    document.entities[id] = {
      ...existing,
      id,
      name: existing?.name ?? id,
      parent: existing?.parent ?? "world",
      components: {
        ...existing?.components,
        [component]: { base: { entity: "world", component }, values: { enabled: false } }
      }
    };
  }
  return document;
}

/** Builtin defaults are normal project assets after insertion; edits never fall back to a module URL. */
interface WaterDefaultAsset {
  file: RuntimeProjectPackage["project"]["files"][number];
  content: string | Uint8Array;
}
export async function loadPlanningWaterDefaults(): Promise<Map<string, WaterDefaultAsset>> {
  const response = await fetch(BUILTIN_WATER_PROJECT_URL);
  if (!response.ok) throw new Error(`Water manifest: HTTP ${response.status}`);
  const manifest = (await response.json()) as { files: RuntimeProjectPackage["project"]["files"] };
  const files = await Promise.all(
    manifest.files
      .filter((file) => /^Water\/(Materials|Textures|Shaders)\//.test(file.virtualPath))
      .map(async (file) => {
        const path = new URL(file.path, BUILTIN_WATER_PROJECT_URL).href;
        const response = await fetch(path);
        if (!response.ok) throw new Error(`${file.virtualPath}: HTTP ${response.status}`);
        const content = ["KTX2", "Texture"].includes(file.type)
          ? new Uint8Array(await response.arrayBuffer())
          : await response.text();
        return [file.virtualPath, { file: { ...file, path }, content }] as const;
      })
  );
  return new Map(files);
}

export function installPlanningWaterDefaults(
  draft: RuntimeProjectEdit,
  files: ReadonlyMap<string, WaterDefaultAsset>
): void {
  const current = new Set(draft.list().map((file) => file.virtualPath));
  draft.createBundle(
    [...files]
      .filter(([path]) => !current.has(path))
      .map(([, asset]) => ({
        ...asset,
        metadata: { summary: `Water ${asset.file.virtualPath}`, usage: "原生 Water 资产，可通过公共项目事务替换。" }
      })),
    {}
  );
}

export function initializePlanningOcean(draft: RuntimeProjectEdit, plan: IslandPlan): void {
  if (plan.parameters.landMode === "continuous") return;
  const state = waterInitialization(draft.preview()),
    seed = String(plan.parameters.seed);
  if (state.removed?.[seed]?.includes("planning-ocean")) return;
  const scene = new RuntimeSceneEdit(draft, draft.preview().project.scene);
  const existing = scene
    .queryComponents({ type: "WaterBodyComponent" })
    .filter(
      (identity) =>
        (scene.readComponent(identity.id).props?.authoring as { shape?: { kind?: string } })?.shape?.kind === "ocean"
    );
  if (existing.length > 1) throw new Error("Seed World requires one Source Ocean");
  const identity = scene.queryComponents({ type: "PlanningEntityAuthoring" })
    .find(identity => scene.readComponent(identity.id).props?.planningId === "planning-ocean");
  // Legacy Ocean component removal retained its identity, unlike the reset
  // bug that deleted the entire authoring entity.
  if (!existing.length && state.seeds[seed]?.includes("planning-ocean") && identity) return;
  if (!existing.length) {
    // A planning handoff can carry the identity before this project's first Ocean initialization.
    let entityId = identity?.entityId;
    if (!entityId) {
      const parent = scene.queryComponents({ type: "PlanningProjectAuthoring" })[0];
      entityId = scene.create({ name: "Ocean", parentEntityId: parent.entityId }).id;
      scene.addComponent(entityId, {
        type: "PlanningEntityAuthoring",
        props: { planningId: "planning-ocean", spatialComponents: {} }
      });
    }
    scene.addComponent(entityId, {
      type: "WaterBodyComponent",
      props: {
        authoring: {
          shape: {
            kind: "ocean",
            waterLevel: 0,
            layout: planningOceanRepresentation(plan) as unknown as GalaceanSourceValueRecord
          },
          terrain: { mode: "host" },

          quality: createWaterQualitySettings("ocean") as unknown as GalaceanSourceValueRecord,
          material: { $ref: "Water/Materials/ocean.mat" },
          priority: 0
        }
      }
    });
  }
  state.seeds[seed] = [...new Set([...(state.seeds[seed] ?? []), "planning-ocean"])];
  draft.writeDocument(waterInitializationPath(draft.preview().project.scene), JSON.stringify(state));
}
