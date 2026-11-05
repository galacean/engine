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
import { planningWaterFrame, transformPlanningWater } from "../PlanningWaterSource.ts";
import type { WaterSourceAuthoring } from "@galacean/engine-world-planning/spatial/runtime/NativeWaterEditor";

export const waterInitializationPath = (scene: string) => `${scene}.water-authoring.json`;
interface WaterInitialization {
  version: 1;
  seeds: Record<string, string[]>;
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
        previous = new Set(
          new RuntimeSceneEdit(
            new RuntimeProjectEdit(
              before,
              nativeAssetFormats(() => ({}))
            ),
            before.project.scene
          )
            .queryComponents({ type: "WaterBodyComponent" })
            .map((body) => body.id)
        );
      const bodies = scene.queryComponents({ type: "WaterBodyComponent" });
      const labels = bodies.flatMap((body) => {
        const identity = scene.queryComponents({ entityId: body.entityId, type: "PlanningEntityAuthoring" })[0];
        return identity && !body.id.startsWith("@instance:")
          ? [scene.readComponent(identity.id).props?.planningId]
          : [];
      });
      let oceans = 0;
      for (const body of bodies) {
        const input = scene.readComponent(body.id).props?.authoring as unknown as WaterSourceAuthoring | undefined;
        if (input?.terrainBinding !== "host") continue;
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
    Object.values(value.seeds).some((ids) => !Array.isArray(ids) || ids.some((id) => typeof id !== "string"))
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
    known = new Set(state.seeds[seed] ?? []);
  for (const water of plan.waters) {
    if (known.has(water.id) || !["lake", "river"].includes(water.kind)) continue;
    const existing = next.entities[water.id];
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

/** A removed generated object is a removed author object, not a request to run its generator again. */
export function retainRemovedWater(document: PlanningDocument, pack: RuntimeProjectPackage): PlanningDocument {
  for (const id of waterInitialization(pack).seeds[String(planningSeed(document))] ?? []) {
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
  const state = waterInitialization(draft.preview()),
    seed = String(plan.parameters.seed);
  if (state.seeds[seed]?.includes("planning-ocean")) return;
  const scene = new RuntimeSceneEdit(draft, draft.preview().project.scene);
  const existing = scene
    .queryComponents({ type: "WaterBodyComponent" })
    .filter(
      (identity) =>
        (scene.readComponent(identity.id).props?.authoring as { shape?: { kind?: string } })?.shape?.kind === "ocean"
    );
  if (existing.length > 1) throw new Error("Seed World requires one Source Ocean");
  if (!existing.length) {
    const parent = scene.queryComponents({ type: "PlanningProjectAuthoring" })[0];
    const entity = scene.create({ name: "Ocean", parentEntityId: parent.entityId });
    scene.addComponent(entity.id, {
      type: "PlanningEntityAuthoring",
      props: { planningId: "planning-ocean", spatialComponents: {} }
    });
    scene.addComponent(entity.id, {
      type: "WaterBodyComponent",
      props: {
        authoring: {
          shape: {
            kind: "ocean",
            waterLevel: 0,
            layout: planningOceanRepresentation(plan) as unknown as GalaceanSourceValueRecord
          },
          terrainBinding: "host",

          quality: createWaterQualitySettings("ocean") as unknown as GalaceanSourceValueRecord,
          material: { $ref: "Water/Materials/ocean.mat" },
          priority: 0
        }
      }
    });
  }
  state.seeds[seed] = [...(state.seeds[seed] ?? []), "planning-ocean"];
  draft.writeDocument(waterInitializationPath(draft.preview().project.scene), JSON.stringify(state));
}
