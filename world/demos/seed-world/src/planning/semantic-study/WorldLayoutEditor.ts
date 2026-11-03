import type { PlanningSession } from "@galacean/engine-world-planning/spatial/PlanningSession";
import { poiForElement } from "@galacean/engine-world-planning/semantic-study/PoiContents";
import { defaultPoiLayout, validatePoiConfig } from "@galacean/engine-world-planning/semantic-study/PoiDistribution";
import {
  SEMANTIC_DEFAULTS,
  type SemanticParameters,
  type SemanticRecipe,
  type SemanticResult
} from "@galacean/engine-world-planning/semantic-study/WorldPlanningContract";
import type { IslandPlan, PlanPoint } from "@galacean/engine-world-planning/semantic-study/IslandPlanModel";

type GlobalKey =
  | "landCoverage"
  | "landAspect"
  | "landOrientation"
  | "offshoreCoverage"
  | "islandRichness"
  | "complexity";
const GLOBALS: readonly { key: GlobalKey; label: string; group: string; min?: number; max?: number }[] = [
  { key: "landCoverage", label: "主陆地占比", group: "陆地与海岸", min: 0.2, max: 0.85 },
  { key: "landAspect", label: "主岛长宽倾向", group: "陆地与海岸" },
  { key: "landOrientation", label: "主岛朝向", group: "陆地与海岸" },
  { key: "complexity", label: "海岸轮廓变化", group: "陆地与海岸" },
  { key: "offshoreCoverage", label: "离岸陆地占比", group: "陆地与海岸", min: 0, max: 0.2 },
  { key: "islandRichness", label: "离岸岛丰富度", group: "陆地与海岸" }
];
/** Actions owned by the application outside the planning preview. */
export interface WorldPlanningOptions {
  /** Generate from the published layout. Read the session before disposing its editor/executor. */
  onGenerate3D?: (plan: IslandPlan, session: PlanningSession) => void | Promise<void>;
}

/** Inspect the current layout and dispose the editor's resources. */
export interface WorldPlanningHandle
  extends Pick<PlanningSession, "describe" | "query" | "inspect" | "select" | "export"> {
  dispatch: PlanningSession["dispatchParameters"];
  createWater: PlanningSession["createWater"];
  removeWater: PlanningSession["removeWater"];
  sampleWater: import("@galacean/engine-world-planning/semantic-study/WorldPlanning3DView").WorldPlanning3DView["sampleWater"];
  sampleDrops: import("@galacean/engine-world-planning/semantic-study/WorldPlanning3DView").WorldPlanning3DView["sampleDrops"];
  journal(): PlanningSession["journal"];
  /** Clone the current published layout. Throws while solving or after the editor is disposed. */
  getPlan(): IslandPlan;
  /** Return requested controls and the latest published layout. */
  getState(): {
    requested: SemanticRecipe;
    result: SemanticResult;
    selectedId: string | null;
    pending: boolean;
    inputRevision: number;
  };
  /** Stop outstanding work and remove the editor. */
  dispose(): Promise<void>;
}
declare global {
  interface Window {
    worldPlanningPage?: WorldPlanningHandle;
  }
}

/** Read supported world controls, clamped to the authoring ranges.
 * @param search URL query string.
 * @returns Complete planner parameters with finite supported overrides.
 */
export function readSemanticParameters(search: string): SemanticParameters {
  const query = new URLSearchParams(search),
    parameters = { ...SEMANTIC_DEFAULTS };
  const seed = query.get("seed");
  if (seed !== null && /^\d+$/.test(seed) && Number.isSafeInteger(Number(seed)) && Number(seed) <= 0xffffffff)
    parameters.seed = Number(seed);
  for (const control of GLOBALS) {
    const raw = query.get(control.key);
    if (raw === null || !raw.trim()) continue;
    const value = Number(raw);
    if (Number.isFinite(value)) parameters[control.key] = Math.max(control.min ?? 0, Math.min(control.max ?? 1, value));
  }
  parameters.poiLayout = defaultPoiLayout();
  const encoded = query.get("poiRecipe");
  if (encoded) {
    try {
      const saved = JSON.parse(encoded),
        defaults = parameters.poiLayout;
      const restored = {
        ...defaults,
        ...saved,
        spacing: { ...defaults.spacing, ...saved.spacing },
        content: { ...defaults.content, ...saved.content },
        network: { ...defaults.network, ...saved.network },
        canyon: { ...defaults.canyon, ...saved.canyon },
        landscape: {
          ...defaults.landscape,
          ...saved.landscape,
          contexts: { ...defaults.landscape.contexts, ...saved.landscape?.contexts }
        }
      };
      validatePoiConfig(restored);
      parameters.poiLayout = restored;
    } catch {
      /* Invalid saved settings fall back to the editable defaults. */
    }
  }
  for (const tier of ["large", "medium", "small"] as const) {
    const raw = query.get(`poi-${tier}-minM`);
    if (raw !== null && raw.trim() && Number.isFinite(Number(raw)))
      parameters.poiLayout!.spacing[tier].minM = Math.max(0, Number(raw));
  }
  return parameters;
}

/** Mount the spatial layout editor with persistent global and selected-object controls.
 * @param host Element that owns the editor.
 * @param options Application-owned actions, including publishing the layout to the full 3D scene.
 * @returns A handle for inspecting the current plan and releasing resources.
 */
export { mountSpatialEditor as mountWorldLayout } from "../spatial/SpatialEditor.ts";

/** Actual polygon areas as fractions of the full map; never copied from requested sliders. */
export function publishedCoverage(plan: IslandPlan): { main: number; offshore: number } {
  const area = (points: PlanPoint[]): number =>
    Math.abs(
      points.reduce((sum, p, i) => {
        const q = points[(i + 1) % points.length];
        return sum + p.x * q.z - q.x * p.z;
      }, 0)
    ) / 2;
  const worldArea = plan.parameters.width * plan.parameters.depth;
  return {
    main: area(plan.land) / worldArea,
    offshore: plan.islands.reduce((sum, ring) => sum + area(ring), 0) / worldArea
  };
}

/** Resolve selectable geometry while preserving independently highlighted roads.
 * @param plan Current layout.
 * @param id Selected geometry identifier, or null for empty space.
 * @returns Road or owning module identifier, or null for unowned geometry.
 */
export function ownerOf(plan: IslandPlan, id: string | null): string | null {
  if (!id) return null;
  const rock = plan.rocks.find((r) => r.id === id);
  if (rock && plan.mountains.some((m) => m.id === rock.groupId)) return rock.groupId;
  if (
    plan.buildings.some((b) => b.id === id) ||
    plan.rocks.some((p) => p.id === id) ||
    plan.waters.some((p) => p.id === id) ||
    plan.landscapes?.some((p) => p.id === id)
  )
    return id;
  if (plan.poiDistribution?.sites.some((p) => p.id === id)) return id;
  if (plan.routes.some((route) => route.id === id) || plan.plazas?.some((place) => place.id === id)) return id;
  const modules = plan.planning?.modules ?? [];
  const direct = modules.find((module) => module.id === id);
  if (direct) return direct.ownerId ?? id;
  const landscapePoi = plan.landscapes?.find((p) => p.id === id)?.poiId;
  if (landscapePoi) return landscapePoi;
  const memberOwner = modules.find((module) => module.memberIds?.includes(id));
  if (memberOwner) return memberOwner.id;
  const owner =
    plan.landscapes?.find((item) => item.id === id)?.ownerId ??
    plan.buildings.find((building) => building.id === id)?.regionId ??
    plan.shapeRecipes?.find((recipe) => recipe.blocks.some((block) => block.id === id))?.id;
  if (owner && modules.some((module) => module.id === owner)) return owner;
  if (id.startsWith("land-island-")) {
    const index = Number(id.slice(12)) - 1;
    return modules.filter((module) => module.kind === "island")[index]?.id ?? null;
  }
  const linked = plan.planning?.relations.find((relation) => relation.owners.includes(id));
  return linked?.owners.find((value) => modules.some((module) => module.id === value)) ?? null;
}

/** Find the parameter owner while retaining independent road selection.
 * @param plan Current layout.
 * @param id Selected geometry or module identifier.
 * @returns Module that regenerates the selected geometry's editable domain.
 */
export function controlOwnerOf(plan: IslandPlan, id: string | null): string | null {
  if (!id) return null;
  if (plan.landscapes?.some((p) => p.id === id)) return poiForElement(plan, id)?.id ?? "landscape";
  const module =
    plan.planning?.modules.find((item) => item.id === id) ??
    plan.planning?.modules.find((item) => item.memberIds?.includes(id));
  return module?.ownerId ?? module?.id ?? ownerOf(plan, id);
}
