import type { Engine, Entity } from "@galacean/engine";
import {
  createRiverWaterBodyAsset,
  createRiverWaterBodyInstance,
  RIVER_LIMITS
} from "@galacean/engine-water/water/index";
import {
  registerRiverWaterBodyPresets,
  RIVER_CANONICAL_LOOK_PRESET_ID,
  riverQualityPlanIdForQuality
} from "@galacean/engine-water/water/presets/river/index";

import type { RiverNetworkDescriptor } from "@galacean/engine-water/water/index";

import { RIVER_COMPILER_SEMANTIC_VERSION } from "@galacean/engine-water/water/compiler/index";
import { WaterSceneRuntimeHost, type WaterSceneBodyRequest } from "@galacean/engine-water/water/runtime/index";
import { RIVER_WATER_BACKEND_ID, RiverWaterBackend } from "@galacean/engine-water/water/runtime/river/index";
import {
  resolvePromptNoiseRiverGeneration,
  resolvePromptNoiseRiverSet,
  type ResolvedPromptNoiseRiverGenerationV1
} from "@galacean/engine-world-planning/generation/noise/PromptNoiseRiverHydrologyResolver";
import type {
  PromptNoiseRiverOperatorV1,
  PromptNoiseTerrainOperatorV1,
  PromptNoiseTerrainProgram
} from "@galacean/engine-world-planning/generation/noise/PromptNoiseTerrainProgram";

/** Maximum terrain river half-width represented without changing authored shape. */
export const PROMPT_NOISE_RIVER_MAX_HALF_WIDTH = RIVER_LIMITS.maxWidth * 0.5;

/** Prompt adapter: Operator/Profile projection and diffing only; Host owns every Water service. */
export class PromptNoiseRiverWaterRuntime {
  private readonly _host: WaterSceneRuntimeHost;
  private readonly _engine: Engine;
  private _activeBodyIds = new Set<string>();
  private _revision = 0;
  private _riverCount = 0;
  private _reachCount = 0;
  private _junctionCount = 0;
  private _widthLimitedRiverCount = 0;
  private _compiling = false;
  private _error: string | null = null;
  private _abortController?: AbortController;
  private _destroyed = false;

  constructor(host: WaterSceneRuntimeHost, engine: Engine) {
    this._host = host;
    this._engine = engine;
    if (!host.hasBackend(RIVER_WATER_BACKEND_ID)) {
      host.registerBackend(new RiverWaterBackend());
      host.registerAuthoring(registerRiverWaterBodyPresets);
    }
  }

  async synchronize(program: PromptNoiseTerrainProgram, worldRevision?: number): Promise<void> {
    this._assertActive();
    const revision = ++this._revision;
    this._abortController?.abort();
    const abortController = new AbortController();
    this._abortController = abortController;
    const operators = program.recipe.operators.filter(isEnabledRiver);
    this._reachCount = operators.length;
    this._widthLimitedRiverCount = operators.filter((river) => river.halfWidth * 2 > RIVER_LIMITS.maxWidth).length;
    this._compiling = true;
    this._error = null;
    try {
      const resolvedSet = resolvePromptNoiseRiverSet(program);
      this._riverCount = resolvedSet.rivers.length;
      this._junctionCount = resolvedSet.rivers.reduce((sum, river) => sum + river.junctionCount, 0);
      const transaction = this._host.beginBodySetTransaction(worldRevision ?? revision);
      const nextBodyIds = new Set<string>();
      for (const resolved of resolvedSet.rivers) {
        transaction.stage(this._createBodyRequest(resolved));
        nextBodyIds.add(resolved.bodyId);
      }
      for (const bodyId of this._activeBodyIds) {
        if (!nextBodyIds.has(bodyId)) transaction.remove(bodyId);
      }
      await transaction.commit(abortController.signal);
      if (revision !== this._revision || abortController.signal.aborted) return;
      this._activeBodyIds = nextBodyIds;
      this._error = null;
    } catch (error) {
      if (revision !== this._revision || abortController.signal.aborted) return;
      this._error = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      if (revision === this._revision) this._compiling = false;
    }
  }

  /** Floating Origin changes only body render offsets; descriptor/hash/compile count remain unchanged. */
  setLogicalOrigin(logicalOrigin: readonly [x: number, z: number]): void {
    this._assertActive();
    this._host.setFloatingOrigin(logicalOrigin);
  }

  /** Cancels an older staging revision before another World consumer starts preparing. */
  cancelPending(): void {
    if (this._destroyed) return;
    this._revision++;
    this._abortController?.abort();
    this._compiling = false;
  }

  async destroy(): Promise<void> {
    if (this._destroyed) return;
    this._destroyed = true;
    this._revision++;
    this._abortController?.abort();
    const ids = [...this._activeBodyIds];
    this._activeBodyIds.clear();
    await Promise.all(ids.map((bodyId) => this._host.removeBody(bodyId)));
  }

  private _createBodyRequest(resolved: ResolvedPromptNoiseRiverGenerationV1): WaterSceneBodyRequest {
    const descriptor: RiverNetworkDescriptor = Object.freeze({
      ...resolved.descriptor,
      defaults: Object.freeze({
        ...resolved.descriptor.defaults,
        surfaceMotion: Object.freeze({
          ...resolved.descriptor.defaults.surfaceMotion,
          displacementAmplitude: resolved.profile.features.macroMotion
            ? resolved.descriptor.defaults.surfaceMotion.displacementAmplitude
            : 0
        })
      })
    });
    const asset = createRiverWaterBodyAsset(descriptor, resolved.assetId);
    const instance = createRiverWaterBodyInstance({
      id: resolved.instanceId,
      assetId: resolved.assetId,
      // PromptNoise owns one canonical visual intent. Profile quality changes
      // implementation budget only and never selects a second Look.
      lookPresetId: RIVER_CANONICAL_LOOK_PRESET_ID,
      qualityPlanId: riverQualityPlanIdForQuality(resolved.profile.quality),
      visible: true
    });
    return Object.freeze({
      bodyId: resolved.bodyId,
      asset,
      instance,
      bodyOrigin: resolved.bodyOrigin,
      logicalBounds: resolved.logicalBounds,
      profileId: resolved.profile.id,
      profileVersion: resolved.profile.version,
      descriptorSchemaVersion: descriptor.schemaVersion,
      compilerSemanticVersion: RIVER_COMPILER_SEMANTIC_VERSION,
      canonicalDescriptorHash: asset.sourceHash,
      createRuntimeContext: (bodyRoot: Entity) => ({
        engine: this._engine,
        root: bodyRoot,
        logicalBodyOrigin: resolved.bodyOrigin
      })
    });
  }

  private _assertActive(): void {
    if (this._destroyed) throw new Error("Prompt Noise River Water adapter has been destroyed.");
  }
}

function isEnabledRiver(operator: PromptNoiseTerrainOperatorV1): operator is PromptNoiseRiverOperatorV1 {
  return operator.enabled && operator.kind === "river";
}

/** Compatibility projection entry now delegates to the shared Hydrology Resolver. */
export function compilePromptNoiseRiverDescriptor(
  river: PromptNoiseRiverOperatorV1,
  _floatingOrigin?: readonly [x: number, z: number]
): RiverNetworkDescriptor {
  return resolvePromptNoiseRiverGeneration(river).descriptor;
}
