import type { TreePopulationTokenV1 } from "@galacean/engine-terrain/terrain/seed/PopulationTokenCodec";
import {
  compilePopulationInstances,
  type CompiledPopulationInstances,
  type PopulationCompilerOptions
} from "./AssetPopulation";
import type { TreeRecipeSource } from "./AssetAssemblySourceLibrary";

/** Population Token and scene-only preview placement consumed by the tree renderer. */
export interface TreeAssemblyControls {
  readonly token: TreePopulationTokenV1;
  /** Scene-only center of the preview; never serialized by the Population Token. */
  readonly stageOrigin: readonly [number, number, number];
}

/** Distance and quality policy owned by the Grasslands renderer rather than a Population Token. */
export interface TreeAssemblyLodProfile {
  readonly switchDistances: readonly [number, number, number];
}

/** Lightweight geometry record retained for reveal helpers and authored source bounds. */
export interface TreeAssemblyPart {
  readonly position: readonly [number, number, number];
  readonly rotation: readonly [number, number, number, number];
  readonly scale: readonly [number, number, number];
  readonly color: readonly [number, number, number];
}

/** Complete typed preview or stress surface for one reusable base-tree recipe. */
export interface TreeAssemblyPlan {
  readonly controls: TreeAssemblyControls;
  readonly recipeIndex: number;
  readonly instances: CompiledPopulationInstances;
}

/** Manual distance samples used by the tree panel's step action. */
export const TREE_ASSEMBLY_LOD_PREVIEW_DISTANCES = [8, 30, 56, 76] as const;

/** Cross-fade duration shared by all procedural 3D LOD transitions. */
export const TREE_ASSEMBLY_LOD_CROSS_FADE_SECONDS = 0.5;

/** Grasslands authored distance thresholds for the production tree preview. */
export const TREE_ASSEMBLY_DEFAULT_LOD_PROFILE: TreeAssemblyLodProfile = {
  switchDistances: [20, 42, 70]
};

/**
 * Converts a validated tree Population Token into compact renderer controls.
 * @param token Exact production tree population.
 * @param stageOrigin Scene-only preview center in meters.
 * @returns Detached tree-renderer controls.
 */
export function treeAssemblyControls(
  token: TreePopulationTokenV1,
  stageOrigin: readonly [number, number, number]
): TreeAssemblyControls {
  return {
    token: {
      ...token,
      colorRgb: [...token.colorRgb] as [number, number, number],
      lodProfile: { ...token.lodProfile, values: [...token.lodProfile.values] },
      population: { ...token.population, extentCells: [...token.population.extentCells] as [number, number] },
      extensions: token.extensions.map((extension) => ({ ...extension }))
    },
    stageOrigin: [...stageOrigin] as [number, number, number]
  };
}

/**
 * Compiles deterministic tree instances that all reuse one versioned production base tree.
 * @param controls Population Token plus scene-only preview placement.
 * @param treeRecipes Production tree recipes loaded from the catalog.
 * @param options Scene-only instance size variation policy.
 * @returns Typed plan with no per-instance objects, Entities, or temporary matrices.
 */
export function createTreeAssemblyPlan(
  controls: TreeAssemblyControls,
  treeRecipes: readonly TreeRecipeSource[],
  options: Pick<PopulationCompilerOptions, "scaleVariation"> = {}
): TreeAssemblyPlan {
  const recipeIndex = treeRecipes.findIndex((recipe) => recipe.id === controls.token.assetId);
  if (recipeIndex < 0) throw new Error(`Production tree recipe "${controls.token.assetId}" is unavailable`);
  const recipe = treeRecipes[recipeIndex];
  const instances = compilePopulationInstances(controls.token, {
    stageOrigin: controls.stageOrigin,
    authoredColor: recipe.defaultColorRgb,
    scaleVariation: options.scaleVariation
  });
  return { controls: treeAssemblyControls(controls.token, controls.stageOrigin), recipeIndex, instances };
}

/**
 * Converts distance to the decreasing projection value consumed by the shared LOD state machine.
 * @param distanceMeters Non-negative distance in meters.
 * @returns Finite screen-relative proxy where larger values select nearer LODs.
 */
export function treeAssemblyLodProjection(distanceMeters: number): number {
  if (!Number.isFinite(distanceMeters) || distanceMeters < 0) {
    throw new RangeError("Tree Assembly distance must be finite and non-negative");
  }
  return 1 / Math.max(distanceMeters, 0.001);
}

/**
 * Validates the renderer-owned monotonic LOD policy.
 * @param profile Candidate Grasslands profile.
 * @returns Nothing.
 * @throws If thresholds are invalid.
 */
export function validateTreeAssemblyLodProfile(profile: TreeAssemblyLodProfile): void {
  const [mediumDistance, farDistance, terminalLodDistance] = profile.switchDistances;
  if (
    !profile.switchDistances.every((distance) => Number.isFinite(distance) && distance > 0) ||
    mediumDistance >= farDistance ||
    farDistance >= terminalLodDistance
  ) {
    throw new RangeError("Tree Assembly LOD distances must be strictly increasing positive values");
  }
}

/**
 * Returns distance-selected tree counts for real per-instance LOD verification.
 * @param instances Compiled tree population.
 * @param cameraPosition World-space camera position.
 * @param profile Renderer-owned distance profile.
 * @returns Counts ordered as the four procedural tree LODs.
 */
export function resolveTreeAssemblyLodDistribution(
  instances: CompiledPopulationInstances,
  cameraPosition: readonly [number, number, number],
  profile: TreeAssemblyLodProfile = TREE_ASSEMBLY_DEFAULT_LOD_PROFILE
): readonly [number, number, number, number] {
  validateTreeAssemblyLodProfile(profile);
  const counts: [number, number, number, number] = [0, 0, 0, 0];
  for (let index = 0; index < instances.count; index++) {
    const offset = index * 16;
    const distance = Math.hypot(
      cameraPosition[0] - instances.records[offset],
      cameraPosition[1] - instances.records[offset + 1],
      cameraPosition[2] - instances.records[offset + 2]
    );
    counts[resolveLodIndex(distance, profile)]++;
  }
  return counts;
}

function resolveLodIndex(distance: number, profile: TreeAssemblyLodProfile): number {
  return distance <= profile.switchDistances[0]
    ? 0
    : distance <= profile.switchDistances[1]
      ? 1
      : distance <= profile.switchDistances[2]
        ? 2
        : 3;
}
