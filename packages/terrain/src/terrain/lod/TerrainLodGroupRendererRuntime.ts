import { Camera, Entity, MeshRenderer, ShaderProperty } from "@galacean/engine";
import type { TerrainProjectResolvedGeometry, TerrainProjectResolvedRenderer } from "../project/TerrainProjectAsset";
import {
  createTerrainLodRendererSetScratch,
  TerrainLodGroupRuntime,
  type TerrainLodRendererSetState
} from "./TerrainLodGroupRuntime";
import { TerrainScreenRelativeHeightRuntime } from "./TerrainScreenRelativeHeightRuntime";

type ResolvedLodGroup = Extract<TerrainProjectResolvedGeometry, { kind: "lod-group" }>["lodGroup"];

/** Current renderer-facing result for one instantiated LODGroup. */
export interface TerrainLodGroupRendererEvidence {
  /** Projected authored reference size divided by viewport height. */
  readonly screenRelativeHeight: number;
  /** Enabled LOD indices and their signed dither values. */
  readonly rendererSets: readonly TerrainLodRendererSetState[];
}

/** Runtime-only LOD policy shared by tree and placed-Prefab adapters. */
export interface TerrainLodRendererTuning {
  /** Whether authored LOD selection and terminal culling are active. */
  readonly enabled: boolean;
  /** Multiplier applied to projected size before authored threshold selection. */
  readonly distanceScale: number;
}

/**
 * Applies one canonical LODGroup to the exact renderers of one instantiated Prefab.
 * Each instance owns its own transition clock; cells may only decide whether this controller is visible.
 */
export class TerrainLodGroupRendererRuntime {
  private static readonly _lodFade = ShaderProperty.getByName("renderer_LodFade");
  private static readonly _lodDitherMacro = "RENDERER_LOD_DITHER";

  private readonly _definition: TerrainLodGroupRuntime;
  private readonly _instance;
  private readonly _rendererSets: readonly (readonly MeshRenderer[])[];
  private readonly _allRenderers: readonly MeshRenderer[];
  private readonly _initialShadowCasters = new Map<MeshRenderer, boolean>();
  private readonly _rendererFades = new Map<MeshRenderer, number>();
  private readonly _screenRelativeHeight: TerrainScreenRelativeHeightRuntime;
  private readonly _visibleObservation = { timeSeconds: 0, visible: true as const, screenRelativeHeight: 0 };
  private readonly _hiddenObservation = { timeSeconds: 0, visible: false as const };
  private readonly _rendererSetScratch = createTerrainLodRendererSetScratch();
  private _lodEnabled = true;
  private _authoringVisible = true;
  private _distanceScale = 1;

  /**
   * Resolves exact renderer selectors from one Prefab instance and initializes stable dither state.
   * @param root Root Entity returned by the canonical Prefab resource.
   * @param camera Camera that determines the screen-relative LOD selection.
   * @param lodGroup Validated canonical LOD metadata with exact renderer selectors.
   * @param crossFadeDurationSeconds Scene-owned animated cross-fade duration in seconds.
   * @throws If a selector no longer resolves to the authored MeshRenderer or one renderer is reused by multiple LODs.
   */
  constructor(
    private readonly _root: Entity,
    camera: Camera,
    lodGroup: ResolvedLodGroup,
    crossFadeDurationSeconds: number
  ) {
    this._definition = new TerrainLodGroupRuntime(lodGroup, crossFadeDurationSeconds);
    this._instance = this._definition.createInstance();
    this._screenRelativeHeight = new TerrainScreenRelativeHeightRuntime(
      this._root,
      camera,
      lodGroup.localReferencePoint,
      lodGroup.size
    );

    const uniqueRenderers = new Set<MeshRenderer>();
    this._rendererSets = lodGroup.lods.map((lod, lodIndex) =>
      lod.renderers.map((binding) => {
        const renderer = resolveRenderer(this._root, binding);
        if (uniqueRenderers.has(renderer)) {
          throw new Error(`Terrain LODGroup renderer is reused by LOD ${lodIndex}`);
        }
        uniqueRenderers.add(renderer);
        if (this._definition.usesAnimatedCrossFade) {
          renderer.shaderData.enableMacro(TerrainLodGroupRendererRuntime._lodDitherMacro);
          renderer.shaderData.setFloat(TerrainLodGroupRendererRuntime._lodFade, 1);
        } else {
          renderer.shaderData.disableMacro(TerrainLodGroupRendererRuntime._lodDitherMacro);
        }
        this._rendererFades.set(renderer, 1);
        this._initialShadowCasters.set(renderer, renderer.castShadows);
        renderer.enabled = false;
        renderer.castShadows = false;
        return renderer;
      })
    );
    this._allRenderers = [...uniqueRenderers];
  }

  /**
   * Advances this Prefab instance and applies its active LOD renderer sets.
   * @remarks Diagnostic evidence may allocate during a cross-fade; production loops use `updateRenderers`.
   * @param timeSeconds Monotonic absolute runtime time in seconds.
   * @param cellVisible Coarse cell/frustum visibility; false suppresses submission without pausing the transition clock.
   * @returns Projection and signed renderer state actually applied this frame.
   */
  update(timeSeconds: number, cellVisible = true): TerrainLodGroupRendererEvidence {
    const screenRelativeHeight = this._selectedScreenRelativeHeight();
    return this.updateWithScreenRelativeHeight(timeSeconds, screenRelativeHeight, cellVisible);
  }

  /**
   * Advances production LOD submission without constructing diagnostic evidence.
   * @param timeSeconds Monotonic absolute runtime time in seconds.
   * @param visible Coarse visibility; false suppresses submission without pausing the transition clock.
   * @returns Whether an animated cross-fade remains active.
   */
  updateRenderers(timeSeconds: number, visible = true): boolean {
    let rendererSets: readonly TerrainLodRendererSetState[];
    if (visible && this._authoringVisible) {
      const observation = this._visibleObservation;
      observation.timeSeconds = timeSeconds;
      observation.screenRelativeHeight = this._selectedScreenRelativeHeight();
      rendererSets = this._instance.updateInto(observation, this._rendererSetScratch);
    } else {
      const observation = this._hiddenObservation;
      observation.timeSeconds = timeSeconds;
      rendererSets = this._instance.updateInto(observation, this._rendererSetScratch);
    }
    return this._submitRendererSets(rendererSets);
  }

  /**
   * Advances production LOD submission from a caller-supplied projection without allocating evidence.
   * @param timeSeconds Monotonic absolute runtime time in seconds.
   * @param screenRelativeHeight Projected authored reference size divided by viewport height.
   * @param visible Coarse visibility; false suppresses submission without pausing the transition clock.
   * @returns Whether an animated cross-fade remains active.
   */
  updateRenderersWithScreenRelativeHeight(timeSeconds: number, screenRelativeHeight: number, visible = true): boolean {
    let rendererSets: readonly TerrainLodRendererSetState[];
    if (visible && this._authoringVisible) {
      const observation = this._visibleObservation;
      observation.timeSeconds = timeSeconds;
      observation.screenRelativeHeight = screenRelativeHeight;
      rendererSets = this._instance.updateInto(observation, this._rendererSetScratch);
    } else {
      const observation = this._hiddenObservation;
      observation.timeSeconds = timeSeconds;
      rendererSets = this._instance.updateInto(observation, this._rendererSetScratch);
    }
    return this._submitRendererSets(rendererSets);
  }

  /**
   * Cancels any active cross-fade and applies the stable LOD selected by the current camera.
   * @param timeSeconds Monotonic absolute runtime time in seconds.
   * @returns Projection and stable renderer state applied for the handoff frame.
   */
  snapToCurrentLod(timeSeconds: number): TerrainLodGroupRendererEvidence {
    const screenRelativeHeight = this._selectedScreenRelativeHeight();
    return this.snapWithScreenRelativeHeight(timeSeconds, screenRelativeHeight);
  }

  /**
   * Cancels any active cross-fade and applies the stable LOD selected by an explicit projection.
   * This is intended for deterministic calibration and capture tools; production selection remains camera-driven.
   * @param timeSeconds Monotonic absolute runtime time in seconds.
   * @param screenRelativeHeight Projected authored reference size divided by viewport height.
   * @returns Supplied projection and stable renderer state applied for the handoff frame.
   */
  snapWithScreenRelativeHeight(timeSeconds: number, screenRelativeHeight: number): TerrainLodGroupRendererEvidence {
    if (!this._authoringVisible) {
      this.disable();
      return { screenRelativeHeight, rendererSets: [] };
    }
    const rendererSets = this._instance.snap({ timeSeconds, visible: true, screenRelativeHeight });
    this._setRootVisible(rendererSets.length > 0);
    this._applyRendererSets(rendererSets);
    return { screenRelativeHeight, rendererSets };
  }

  /**
   * Applies demo runtime LOD controls without mutating canonical Prefab metadata.
   * @param tuning Mesh-LOD enablement and projected-distance multiplier.
   * @returns Nothing.
   * @throws If the distance multiplier is not finite and positive.
   */
  setTuning(tuning: TerrainLodRendererTuning): void {
    if (!Number.isFinite(tuning.distanceScale) || tuning.distanceScale <= 0) {
      throw new RangeError("Terrain LOD distance scale must be finite and positive");
    }
    this._lodEnabled = tuning.enabled;
    this._distanceScale = tuning.distanceScale;
  }

  /**
   * Applies a persistent World Authoring visibility override without destroying the generated instance.
   * Keeping the instance alive makes rollback and undo exact and allocation-free.
   */
  setAuthoringVisible(visible: boolean): void {
    if (this._authoringVisible === visible) return;
    this._authoringVisible = visible;
    if (!visible) this.disable();
  }

  /**
   * Applies a precomputed projection while retaining this Prefab instance's independent transition state.
   * @remarks Diagnostic evidence may allocate during a cross-fade; production loops use `updateRenderersWithScreenRelativeHeight`.
   * @param timeSeconds Monotonic absolute runtime time in seconds.
   * @param screenRelativeHeight Projected authored reference size divided by viewport height.
   * @param cellVisible Coarse cell/frustum visibility; false suppresses submission without pausing the transition clock.
   * @returns Supplied projection and signed renderer state actually applied this frame.
   */
  updateWithScreenRelativeHeight(
    timeSeconds: number,
    screenRelativeHeight: number,
    cellVisible = true
  ): TerrainLodGroupRendererEvidence {
    const rendererSets = this._instance.update(
      cellVisible && this._authoringVisible
        ? { timeSeconds, visible: true, screenRelativeHeight }
        : { timeSeconds, visible: false }
    );
    this._setRootVisible(rendererSets.length > 0);
    this._applyRendererSets(rendererSets);
    return { screenRelativeHeight, rendererSets };
  }

  /** Disables every renderer owned by this controller without mutating its canonical Prefab assets. */
  disable(): void {
    this._setRootVisible(false);
    for (let rendererIndex = 0; rendererIndex < this._allRenderers.length; rendererIndex++) {
      this._setRendererVisible(this._allRenderers[rendererIndex]!, false);
    }
  }

  private _selectedScreenRelativeHeight(): number {
    return this._lodEnabled ? this._screenRelativeHeight.resolve() * this._distanceScale : Number.MAX_SAFE_INTEGER;
  }

  private _applyRendererSets(rendererSets: readonly TerrainLodRendererSetState[]): void {
    if (rendererSets.length === 0) {
      for (let rendererIndex = 0; rendererIndex < this._allRenderers.length; rendererIndex++) {
        this._setRendererVisible(this._allRenderers[rendererIndex]!, false);
      }
      return;
    }
    // Keep selected renderers registered instead of removing and re-adding them every frame.
    for (let lodIndex = 0; lodIndex < this._rendererSets.length; lodIndex++) {
      let selected = false;
      for (let stateIndex = 0; stateIndex < rendererSets.length; stateIndex++) {
        if (rendererSets[stateIndex]!.lodIndex === lodIndex) {
          selected = true;
          break;
        }
      }
      if (selected) continue;
      const renderers = this._rendererSets[lodIndex]!;
      for (let rendererIndex = 0; rendererIndex < renderers.length; rendererIndex++) {
        this._setRendererVisible(renderers[rendererIndex]!, false);
      }
    }
    for (let stateIndex = 0; stateIndex < rendererSets.length; stateIndex++) {
      const state = rendererSets[stateIndex]!;
      const renderers = this._rendererSets[state.lodIndex];
      if (!renderers) throw new Error(`Terrain LODGroup selected absent LOD ${state.lodIndex}`);
      for (let rendererIndex = 0; rendererIndex < renderers.length; rendererIndex++) {
        const renderer = renderers[rendererIndex]!;
        this._setRendererFade(renderer, state.signedFade);
        this._setRendererVisible(renderer, true);
      }
    }
  }

  private _submitRendererSets(rendererSets: readonly TerrainLodRendererSetState[]): boolean {
    this._setRootVisible(rendererSets.length > 0);
    this._applyRendererSets(rendererSets);
    for (let stateIndex = 0; stateIndex < rendererSets.length; stateIndex++) {
      if (rendererSets[stateIndex]!.crossFading) return true;
    }
    return false;
  }

  private _setRootVisible(visible: boolean): void {
    if (this._root.isActive !== visible) this._root.isActive = visible;
  }

  private _setRendererFade(renderer: MeshRenderer, signedFade: number): void {
    if (this._rendererFades.get(renderer) === signedFade) return;
    renderer.shaderData.setFloat(TerrainLodGroupRendererRuntime._lodFade, signedFade);
    this._rendererFades.set(renderer, signedFade);
  }

  private _setRendererVisible(renderer: MeshRenderer, visible: boolean): void {
    if (renderer.enabled !== visible) renderer.enabled = visible;
    const castsShadows = visible && (this._initialShadowCasters.get(renderer) ?? true);
    if (renderer.castShadows !== castsShadows) renderer.castShadows = castsShadows;
  }
}

function resolveRenderer(root: Entity, binding: TerrainProjectResolvedRenderer): MeshRenderer {
  let entity: Entity | undefined = root;
  for (const childIndex of binding.entityPath) entity = entity?.children[childIndex];
  if (!entity) throw new Error("Terrain LODGroup renderer selector does not resolve in its Prefab instance");
  const renderers: MeshRenderer[] = [];
  entity.getComponents(MeshRenderer, renderers);
  const renderer = renderers[binding.componentIndex];
  if (!renderer || renderer.mesh !== binding.mesh || renderer.getMaterial() !== binding.material) {
    throw new Error("Terrain LODGroup renderer selector no longer matches its canonical Prefab binding");
  }
  return renderer;
}
