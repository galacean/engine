import type { IslandPlan } from "../../../semantic-study/IslandPlanModel.ts";
import type { PlanningDocument } from "../../../spatial/PlanningDocument.ts";
import { sameMasonryPlan } from "../../../masonry/MasonryPlanningOwnership.ts";
import { isRockFormationOnlyEdit } from "./Edit.ts";
import type { PublishedPlanningSeedScene } from "../../../spatial/runtime/PlanningSeedScenePublication.ts";
import { planningPresentedSolids } from "../../../spatial/runtime/PlanningPresentedSolids.ts";
import type { RockFormationClient } from "./Client.ts";
import type { RockFormationSettings } from "./Settings.ts";
import type { RockFormationMesh } from "@galacean/engine-terrain/rock-formation/types";
import { rockFormationPlacements } from "./Placement.ts";
import { rockGrassExclusions } from "./GrassExclusions.ts";
import { ROCK_GENERATION_DEFAULTS, type RockGenerationProfile } from "./GenerationProfile.ts";

/** Shared by publication routing and render-pause policy. Buildings may be present;
 * only a change to their authored layout requires the full scene transaction. */
export function canPublishRockFormationEdit(
  current: { plan: IslandPlan } | undefined,
  previous: PlanningDocument,
  next: PlanningDocument,
  plan: IslandPlan
): boolean {
  return !!current && sameMasonryPlan(current.plan, plan) && isRockFormationOnlyEdit(previous, next);
}

/** Stage a material edit without touching geometry, collision or building supports. */
export function prepareRockMaterialPublication(
  current: PublishedPlanningSeedScene,
  settings: Pick<RockFormationSettings, "textureScale" | "colorBlend">,
  signal: AbortSignal
) {
  signal.throwIfAborted();
  let consumed = false;
  return {
    commit() {
      signal.throwIfAborted();
      if (consumed) throw Error("Rock material publication already consumed");
      current.solids.setRockTextureScale(settings.textureScale);
      current.vegetation?.setRockTextureScale(settings.textureScale);
      current.solids.setRockColorBlend(settings.colorBlend);
      current.world.population.setRockGrassGround(settings);
      consumed = true;
    },
    discard() {
      consumed = true;
    }
  };
}

/** One local transaction for rock render/collision, companion sources and dependent
 * building supports. The accepted world, terrain, water and other resources stay alive. */
export async function prepareRockFormationPublication(
  current: PublishedPlanningSeedScene,
  plan: IslandPlan,
  meshes: readonly RockFormationMesh[],
  client: RockFormationClient,
  settings: RockFormationSettings,
  revision: number,
  signal: AbortSignal,
  generationProfile: RockGenerationProfile = ROCK_GENERATION_DEFAULTS
) {
  signal.throwIfAborted();
  const rocks = current.solids.prepareRocks(
    plan,
    planningPresentedSolids(plan, current.heightTransition?.fields ?? current.data.fields, current.data.fields),
    meshes,
    settings.textureScale,
    settings.colorBlend
  );
  let vegetation: Awaited<ReturnType<NonNullable<typeof current.vegetation>["prepareRocks"]>> | undefined;
  let masonry: Awaited<ReturnType<NonNullable<typeof current.masonry>["prepareRockSupports"]>> | undefined;
  let grass: ReturnType<typeof current.world.population.prepareRockGrass> | undefined;
  let consumed = false;
  const discard = () => {
    if (consumed) return;
    consumed = true;
    rocks.discard();
    vegetation?.discard();
    masonry?.discard();
    grass?.discard();
  };
  try {
    vegetation = await current.vegetation?.prepareRocks(client, settings, signal, generationProfile);
    signal.throwIfAborted();
    masonry = await current.masonry?.prepareRockSupports(plan, meshes, revision, signal);
    signal.throwIfAborted();
    grass = current.world.population.prepareRockGrass(
      rockFormationPlacements(
        planningPresentedSolids(plan, current.heightTransition?.fields ?? current.data.fields, current.data.fields),
        meshes
      ),
      rockGrassExclusions(plan, current.data.fields, (x, y, z) => current.navigation.samplePointIsUnderwater(x, y, z))
    );
    return {
      metrics: { ...rocks.metrics, ...masonry?.metrics, ...grass.metrics },
      discard,
      commit() {
        signal.throwIfAborted();
        if (consumed) throw Error("Rock publication frame already consumed");
        // Detail material binding can reject before any accepted rock is replaced.
        try {
          masonry?.commit();
          rocks.commit();
          vegetation?.commit();
          grass!.commit();
          masonry?.finalize();
          current.world.population.setRockGrassGround(settings);
          consumed = true;
        } catch (error) {
          masonry?.rollback();
          discard();
          throw error;
        }
      }
    };
  } catch (error) {
    discard();
    throw error;
  }
}
