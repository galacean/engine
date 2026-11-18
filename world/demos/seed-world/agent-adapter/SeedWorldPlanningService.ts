import type { PlanningSession } from "@galacean/engine-world-planning/spatial/PlanningSession";
import type { PlanningWaterCreation } from "@galacean/engine-world-planning/spatial/PlanningWaterAuthoring";
import type { PlanPoint } from "@galacean/engine-world-planning/semantic-study/IslandPlanModel";
import { createPlanningRingQuery } from "@galacean/engine-world-planning/semantic-study/WorldPlanningTerrain";
import type { PlantProjectResources } from "@galacean/engine-vegetation/asset-assembly/PlantSpeciesResources";

/** Owns planning transactions independently of any building representation. */
export class SeedWorldPlanningService {
  constructor(private readonly session: PlanningSession, private readonly assertActive: () => void,
    private readonly assetsChanged?: (references: PlantProjectResources) => void) {}

  invalidateAssets(references: PlantProjectResources): boolean {
    if (!this.assetsChanged) return false;
    this.assetsChanged(references);
    return true;
  }

  document() { return this.session.export(); }

  /** Stage a water body through the same solver and publication path as the editor. */
  createWater(input: PlanningWaterCreation) {
    this.assertActive();
    return this.session.createWater(input);
  }

  /** Build a placement test against the accepted land, hydrology and template footprints. */
  riverPlacementTest(): (outline: PlanPoint[]) => boolean {
    const plan = this.session.result?.plan;
    if (!plan) throw new Error("Planning world is not ready");
    const land = createPlanningRingQuery(plan.land);
    const obstacles = [
      ...plan.waters.map(water => water.outline),
      ...(plan.worldTemplateSite?.footprints ?? []).map(footprint => footprint.outline)
    ].filter(outline => outline.length >= 3).map(createPlanningRingQuery);
    return outline => land.containsPolygon(outline) && !obstacles.some(obstacle => obstacle.overlapsPolygon(outline));
  }

  beginEdit() {
    this.assertActive();
    const edit = this.session.beginProjectEdit();
    const before = this.session.export();
    return { ...edit, before,
      service: new SeedWorldPlanningService(edit.session, this.assertActive, this.assetsChanged),
      document: () => edit.session.export()
    };
  }
}
