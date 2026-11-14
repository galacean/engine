import type { PlanningSession } from "@galacean/engine-world-planning/spatial/PlanningSession";
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
