import type { WaterSceneRuntimeHost } from "../water/runtime/index";
import { markWaterSceneMutationSafe } from "../water/runtime/index";
import {
  readSeedWorldWaterColor,
  validateSeedWorldWaterColor,
  withSeedWorldWaterColor,
  type SeedWorldWaterColorRgb
} from "./SeedWorldWaterColor";

/** Per-body Look authoring for the current world; never edits a shared Lake preset. */
export class SeedWorldWaterColorRuntime {
  private readonly _lookIds = new Map<string, Readonly<{ lookId: string; baseLookId: string }>>();

  constructor(private readonly _host: WaterSceneRuntimeHost) {}

  snapshot(): readonly Readonly<{ bodyId: string; colorRgb: SeedWorldWaterColorRgb }>[] {
    return Object.freeze(
      [...this._lookIds.keys()].sort().flatMap((bodyId) => {
        const colorRgb = this.read(bodyId);
        return colorRgb
          ? [Object.freeze({ bodyId, colorRgb: Object.freeze([...colorRgb]) as SeedWorldWaterColorRgb })]
          : [];
      })
    );
  }

  resolveLookId(bodyId: string, defaultLookId: string): string {
    const edited = this._lookIds.get(bodyId);
    return edited?.baseLookId === defaultLookId ? edited.lookId : defaultLookId;
  }

  read(bodyId: string): SeedWorldWaterColorRgb | undefined {
    const look = this._host.readBodyLookAuthoring(bodyId);
    return look ? readSeedWorldWaterColor(look) : undefined;
  }

  async update(bodyId: string, color: SeedWorldWaterColorRgb, signal: AbortSignal): Promise<SeedWorldWaterColorRgb> {
    let safe = true;
    try {
      validateSeedWorldWaterColor(color);
      if (signal.aborted) throw new DOMException("Water color update aborted", "AbortError");
      const source = this._host.readBodyLookAuthoring(bodyId);
      if (!source) throw new Error(`Water body '${bodyId}' is not currently published.`);
      const edited = this._lookIds.get(bodyId);
      const baseLookId = edited?.lookId === source.look.id ? edited.baseLookId : source.look.id;
      const lookId = `seed-world-color:${bodyId}:${baseLookId}`;
      // Validate the appearance before creating any registry entries.
      withSeedWorldWaterColor(source, color);
      if (!this._host.assets.getLookAuthoringSnapshot(lookId)) {
        this._host.registerAuthoring((assets) => {
          const appearanceId = `${lookId}:appearance`;
          const opticsId = `${lookId}:optics`;
          const reflectionId = `${lookId}:reflection`;
          const renderStateId = `${lookId}:render-state`;
          assets.registerAppearancePreset({
            ...source.appearance,
            id: appearanceId,
            appearance: { ...source.appearance.appearance, id: `${appearanceId}:surface` }
          });
          assets.registerOpticsPreset({ ...source.optics, id: opticsId });
          assets.registerReflectionPolicyPreset({ ...source.reflectionPolicy, id: reflectionId });
          assets.registerRenderStatePreset({ ...source.renderState, id: renderStateId });
          assets.registerLookPreset({
            ...source.look,
            id: lookId,
            appearanceAssetId: `${appearanceId}:surface`,
            opticalProfileId: opticsId,
            reflectionPolicyId: reflectionId,
            renderStatePresetId: renderStateId
          });
        });
      }
      safe = false;
      await this._host.updateLookAuthoring(lookId, (current) => withSeedWorldWaterColor(current, color), signal);
      if (source.look.id !== lookId) {
        await this._host.replaceBodyInstance(bodyId, (instance) => ({ ...instance, lookPresetId: lookId }), signal);
      }
      this._lookIds.set(bodyId, { lookId, baseLookId });
      return this.read(bodyId)!;
    } catch (error) {
      if (safe) throw markWaterSceneMutationSafe(error);
      throw error;
    }
  }
}
