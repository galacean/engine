import type { IslandPlan } from "../../semantic-study/IslandPlanModel";
import type { SemanticRecipe } from "../../semantic-study/WorldPlanningContract";

import { settlementRandom } from "../../semantic-study/SettlementGeometry";
import { territoryLookup } from "../ecology/PoiTerritories";

export const MOJAVE_ROCK_GROUPS = Array.from({ length: 6 }, (_, i) => `mojave/A0${i + 1}`);
export const MOJAVE_STONES = Array.from({ length: 6 }, (_, i) => `mojave/R0${i + 1}`);

/** Bind the theme to canonical POI volumes and landscape slots; never generate positions or counts here. */
export function applyMojaveDesertAppearance(plan: IslandPlan, recipe: SemanticRecipe): void {
  if (plan.parameters.worldTemplate?.id !== "titan-wasteland") return;
  const select = (ids: string[], id: string) =>
    ids[Math.floor(settlementRandom(plan.parameters.seed, `mojave:asset:${id}`) * ids.length)];
  const territoryAt = territoryLookup(plan);
  const ownerAt = (point: { x: number; z: number }, owner?: string) => owner ?? territoryAt(point)[0]?.site.id;
  const variant = (owner?: string) =>
    recipe.edits[owner ?? ""]?.regionalAppearance?.rockMaterial ??
    recipe.parameters.regionalAppearance?.rockMaterial ??
    "yellow";
  plan.rocks = plan.rocks.map((rock) => ({
    ...rock,
    assetId: select(MOJAVE_ROCK_GROUPS, rock.id),
    materialVariant: variant(ownerAt(rock.center, rock.groupId))
  }));
  plan.landscapes = (plan.landscapes ?? []).map((item) => {
    const owner = ownerAt(item.center, item.poiId);
    return {
      ...item,
      poiId: owner,
      assetId: item.kind === "tree" ? undefined : select(MOJAVE_STONES, item.id),
      assetRenderMode: "prefab",
      ...(item.kind === "rock" ? { materialVariant: variant(owner) } : {})
    };
  });
}
