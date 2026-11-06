import type { Engine, JSONAsset } from "@galacean/engine";
import type { TerrainLightingRuntime } from "../../integrations/terrain/lighting/TerrainLightingRuntime.ts";
import { SEED_WORLD_LIGHTING_PROFILE_URL } from "../../integrations/terrain/lighting/TerrainLightingProfile.ts";
import { loadTerrainLightingProfile } from "../../integrations/terrain/lighting/TerrainLightingProfileResources.ts";
import { applyPlanningLightSources } from "../PlanningLightingParameters";

/** Async asset resolution belongs to presentation, outside the synchronous authoring/layout transaction. */
export class PlanningLightingProfileRuntime {
  private request = 0;
  private disposed = false;
  private resource?: JSONAsset;

  constructor(
    private readonly engine: Engine,
    private readonly lighting: Pick<
      TerrainLightingRuntime,
      "setTimeOfDayLightingProfile" | "setTuning" | "setVisibility" | "applyVisualTuning"
    >
  ) {}

  get asset(): JSONAsset | undefined {
    return this.resource;
  }

  /** False means a newer request or disposal superseded this result; it must not update post-processing. */
  async apply(values: Record<string, unknown>): Promise<boolean> {
    if (this.disposed) throw new Error("Lighting profile runtime is disposed");
    const request = ++this.request;
    try {
      const { asset, data } = await loadTerrainLightingProfile(
        this.engine,
        values.profileUrl === undefined ? SEED_WORLD_LIGHTING_PROFILE_URL : (values.profileUrl as string)
      );
      if (this.disposed || request !== this.request) return false;
      // Reinstall the source before explicit overrides so reset/base and profile switches cannot retain old curves.
      this.lighting.applyVisualTuning(data.visualTuning);
      applyPlanningLightSources(this.lighting, values, data.samples);
      this.resource = asset;
      return true;
    } catch (error) {
      if (this.disposed || request !== this.request) return false;
      throw error;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.request++;
    // Shared JSONAsset lifecycle is owned by ResourceManager/the native referencing component.
    this.resource = undefined;
  }
}
