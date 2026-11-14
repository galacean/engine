import {
  BoundingBox,
  Camera,
  Color,
  Entity,
  Material,
  MeshRenderer,
  Script,
  ShaderMacro,
  ShaderProperty,
  Texture2D,
  Vector3,
  Vector4
} from "@galacean/engine";
import type {
  FlowerPopulationTokenV1,
  GrassPopulationTokenV1,
  RockPopulationTokenV1,
  ShrubPopulationTokenV1
} from "@galacean/engine-terrain/terrain/seed/PopulationTokenCodec";
import {
  createTerrainLodRendererSetScratch,
  TerrainLodGroupRuntime,
  type TerrainLodGroupInstance
} from "@galacean/engine-terrain/terrain/lod/TerrainLodGroupRuntime";
import {
  assetPopulationMetrics,
  assetPopulationVariationDiagnostics,
  compilePopulationInstances,
  populationLodInstanceCount,
  resolvePopulationBounds,
  type AssetPopulationMetrics,
  type AssetPopulationVariationDiagnostics,
  type CompiledPopulationInstances
} from "./AssetPopulation";
import type {
  AssetAssemblySourceLibrary,
  ProductionDistanceFade,
  ProductionLodGroupProfile,
  ProductionRenderAtom
} from "./AssetAssemblySourceLibrary";
import { productionPrefabDistanceFade } from "./AssetAssemblySourceLibrary";
import { configureAssetAssemblyRendererInstance } from "./TreeAssemblyRuntime";
import {
  ASSET_ASSEMBLY_ENTRANCE_DURATION_MS,
  resolveAssetAssemblyDistanceFade,
  resolveAssetAssemblyLodHeights,
  type AssetAssemblyRevealRange
} from "./AssetAssemblyRenderProfile";

const REVEAL_PROGRESS = ShaderProperty.getByName("renderer_GenerationRevealProgress");
const REVEAL_ORIGIN_Y = ShaderProperty.getByName("renderer_GenerationRevealOriginY");
const REVEAL_HEIGHT = ShaderProperty.getByName("renderer_GenerationRevealHeight");
const REVEAL_LIFT = ShaderProperty.getByName("renderer_GenerationRevealLift");
const ASSET_ASSEMBLY_COLOR = ShaderProperty.getByName("renderer_AssetAssemblyColor");
const LOD_FADE = ShaderProperty.getByName("renderer_LodFade");
const LOD_DITHER_MACRO = ShaderMacro.getByName("RENDERER_LOD_DITHER");
const GENERATION_REVEAL_MACRO = ShaderMacro.getByName("RENDERER_GENERATION_REVEAL");
const GRASS_DISTANCE_FADE_ENABLE = ShaderProperty.getByName("material_GrassDistanceFadeEnable");
const BASE_TEXTURE = ShaderProperty.getByName("material_BaseTexture");
const BASE_TEXTURE_MACRO = ShaderMacro.getByName("MATERIAL_HAS_BASETEXTURE");
const CROSS_FADE_SECONDS = 0.5;

/** Seed-decoded non-tree appearance rendered by a category-specific production path. */
export type VegetationPopulationToken =
  | ShrubPopulationTokenV1
  | GrassPopulationTokenV1
  | FlowerPopulationTokenV1
  | RockPopulationTokenV1;

/** Live evidence for one complete-atom instancing surface. */
export interface VegetationAssemblyDiagnostics {
  readonly category: VegetationPopulationToken["category"];
  readonly uniformScale: number;
  readonly population: AssetPopulationMetrics;
  readonly automaticDistance: boolean;
  readonly distanceCulling: boolean;
  readonly baseTexture: {
    readonly source: "preset" | "custom";
    readonly label: string;
    readonly width: number;
    readonly height: number;
  };
  readonly simulatedDistance: number;
  readonly transitioning: boolean;
  readonly draws: number;
  readonly instancesByLod: readonly number[];
  readonly authoredLeafCounts: readonly number[];
  readonly retainedLeafCounts: readonly number[];
  readonly castsShadows: boolean;
  readonly receivesShadows: boolean;
  readonly variation: AssetPopulationVariationDiagnostics;
  readonly distanceFade: {
    readonly enabled: boolean;
    readonly distance: number;
    readonly falloff: number;
    readonly visibleInstances: number;
    readonly averageCoverage: number;
  };
  readonly perInstanceEntities: number;
}

/** Initialization contract for one non-tree category surface. */
export interface VegetationAssemblyRuntimeOptions {
  readonly camera: Camera;
  readonly sourceLibrary: AssetAssemblySourceLibrary;
  readonly token: VegetationPopulationToken;
  readonly stageOrigin: readonly [number, number, number];
  readonly shadows: boolean;
  /** Multiplies each instance's geometry scale, shared by GPU rendering, camera LOD, and reveal bounds. */
  readonly uniformScale?: number;
  /** Compare authored dimensions in standard mode while retaining stress-population variation. */
  readonly sourceScalePreview?: boolean;
  /** Keep source culling by default; authoring overviews may retain the terminal mesh instead. */
  readonly distanceCulling?: boolean;
}

interface VegetationBatch {
  readonly renderers: readonly MeshRenderer[];
  readonly authoredCastShadows: boolean;
  readonly material: Material;
  count: number;
}

/** Shares source geometry and materials across ordinary renderers; the Engine culls and batches them. */
export class VegetationAssemblyRuntime extends Script {
  private _camera: Camera | null = null;
  private _sourceLibrary: AssetAssemblySourceLibrary | null = null;
  private _token: VegetationPopulationToken | null = null;
  private _stageOrigin: readonly [number, number, number] = [0, 0, 0];
  private _shadows = true;
  private _uniformScale = 1;
  private _sourceScalePreview = false;
  private _root: Entity | null = null;
  private _batches: VegetationBatch[] = [];
  private _instanceRoots: Entity[] = [];
  private _compiled: CompiledPopulationInstances | null = null;
  private _lodInstances: TerrainLodGroupInstance[] = [];
  private readonly _lodObservation = { timeSeconds: 0, visible: true as const, screenRelativeHeight: 0 };
  private readonly _lodRendererSetScratch = createTerrainLodRendererSetScratch();
  private _lodCounts = new Uint32Array(0);
  private _automaticDistance = true;
  private _distanceCulling = true;
  private _sourceDistanceFade: ProductionDistanceFade = { enabled: false, distance: 0, falloff: 0 };
  private _customBaseTexture: { texture: Texture2D; label: string } | null = null;
  private _simulatedDistance = 8;
  private _elapsedSeconds = 0;
  private _lastCameraPosition: [number, number, number] = [Number.NaN, Number.NaN, Number.NaN];
  private _instancesByLod: number[] = [];
  private _transitioning = false;
  private _distanceVisibleInstances = 0;
  private _distanceCoverageSum = 0;
  private _playback = 0;

  /**
   * Publishes the initial category-specific assembly surface.
   * @param options Catalog sources, Population Token, stand placement, and render state.
   * @returns Nothing.
   */
  initialize(options: VegetationAssemblyRuntimeOptions): void {
    if (this._sourceLibrary) throw new Error("Vegetation Assembly runtime is already initialized");
    const uniformScale = options.uniformScale ?? 1;
    if (!Number.isFinite(uniformScale) || uniformScale <= 0) {
      throw new RangeError("Vegetation Assembly uniform scale must be finite and positive");
    }
    this._camera = options.camera;
    this._sourceLibrary = options.sourceLibrary;
    this._stageOrigin = [...options.stageOrigin] as [number, number, number];
    this._shadows = options.shadows;
    this._uniformScale = uniformScale;
    this._sourceScalePreview = options.sourceScalePreview ?? false;
    this._distanceCulling = options.distanceCulling ?? true;
    this.setToken(options.token);
  }

  /**
   * Atomically rebuilds one category from its complete Population Token.
   * @param token Appearance, density, and local population contract for one category.
   * @returns Updated runtime evidence.
   */
  setToken(token: VegetationPopulationToken): VegetationAssemblyDiagnostics {
    this._validateSourceIdentity(token);
    const compiled = compilePopulationInstances(token, {
      stageOrigin: this._stageOrigin,
      authoredColor: this._sourceColor(token),
      uniformScale: this._uniformScale,
      scaleVariation: !this._sourceScalePreview || token.population.mode === "stress-1000"
    });
    const nextRoot = this.entity.createChild(`${token.category} production batches`);
    nextRoot.isActive = false;
    const nextBatches: VegetationBatch[] = [];
    const instanceRoots = Array.from({ length: compiled.count }, (_, index) => {
      const instance = nextRoot.createChild(`${token.category} ${index}`);
      setInstanceTransform(instance, compiled, index);
      return instance;
    });
    try {
      for (const [lod, atom] of this._sourceAtoms(token).entries()) {
        nextBatches.push(
          this._createAtomBatch(instanceRoots, atom, compiled, `${token.category} LOD${lod}`, this._sourceColor(token))
        );
      }
    } catch (error) {
      nextBatches.forEach(disposeBatch);
      nextRoot.destroy();
      throw error;
    }

    const previousRoot = this._root;
    const previousBatches = this._batches;
    this._token = detachToken(token);
    this._compiled = compiled;
    this._sourceDistanceFade = productionPrefabDistanceFade(this._sourceAtoms(token)[0]);
    const lodDefinition = createLodDefinition(token, this._sourceLibrary!, this._distanceCulling);
    this._lodInstances = Array.from({ length: compiled.count }, () => lodDefinition.createInstance());
    this._root = nextRoot;
    this._batches = nextBatches;
    this._instanceRoots = instanceRoots;
    this._lodCounts = new Uint32Array(nextBatches.length);
    this._instancesByLod = Array.from({ length: nextBatches.length }, () => 0);
    this._lastCameraPosition = [Number.NaN, Number.NaN, Number.NaN];
    this._applyLod(true);
    nextRoot.isActive = true;
    previousBatches.forEach(disposeBatch);
    previousRoot?.destroy();
    return this.getDiagnostics();
  }

  /** Measures all LODs so changing distance cannot invalidate the showcase layout. */
  getPreviewBounds(): BoundingBox {
    const atoms = this._sourceAtoms(this._token!);
    const bounds = resolvePopulationBounds(this._compiled!, atoms[0].renderer.mesh.bounds);
    for (const atom of atoms.slice(1)) {
      BoundingBox.merge(bounds, resolvePopulationBounds(this._compiled!, atom.renderer.mesh.bounds), bounds);
    }
    return bounds;
  }

  getStageOrigin(): readonly [number, number, number] {
    return this._stageOrigin;
  }

  /** Publishes a scene-only placement through the instance compiler without rebuilding source geometry/materials. */
  setStageOrigin(origin: readonly [number, number, number]): void {
    if (!origin.every(Number.isFinite)) throw new RangeError("Vegetation stage origin must be finite");
    if (origin.every((value, axis) => value === this._stageOrigin[axis])) return;
    this._stageOrigin = [...origin];
    this._compiled = compilePopulationInstances(this._token!, {
      stageOrigin: this._stageOrigin,
      authoredColor: this._sourceColor(this._token!),
      uniformScale: this._uniformScale,
      scaleVariation: !this._sourceScalePreview || this._token!.population.mode === "stress-1000"
    });
    this._instanceRoots.forEach((instance, index) => setInstanceTransform(instance, this._compiled!, index));
    this._batches.forEach((batch, lod) => {
      const source = this._sourceAtoms(this._token!)[lod].renderer.mesh.bounds;
      batch.renderers.forEach((renderer, index) => {
        const reveal = resolveInstanceRevealRange(this._compiled!, index, source.min.y, source.max.y);
        renderer.shaderData.setFloat(REVEAL_ORIGIN_Y, reveal.minimumY);
        renderer.shaderData.setFloat(REVEAL_HEIGHT, reveal.height);
      });
    });
    this._lastCameraPosition = [Number.NaN, Number.NaN, Number.NaN];
    this._applyLod(true);
  }

  /**
   * Selects a shared manual LOD distance for this category.
   * @param distanceMeters Non-negative preview distance.
   * @returns Updated runtime evidence.
   */
  setSimulatedDistance(distanceMeters: number): VegetationAssemblyDiagnostics {
    if (!Number.isFinite(distanceMeters) || distanceMeters < 0) {
      throw new RangeError("LOD distance must be finite and non-negative");
    }
    this._automaticDistance = false;
    this._simulatedDistance = distanceMeters;
    this._applyLod(false);
    return this.getDiagnostics();
  }

  /**
   * Enables independent camera distance for LOD selection and terminal distance fading.
   * @param enabled Whether automatic per-instance selection is active.
   * @returns Updated runtime evidence.
   */
  setAutomaticDistance(enabled: boolean): VegetationAssemblyDiagnostics {
    this._automaticDistance = enabled;
    this._lastCameraPosition = [Number.NaN, Number.NaN, Number.NaN];
    this._applyLod(false);
    return this.getDiagnostics();
  }

  /** Toggles source terminal LOD and material distance culling without rebuilding meshes or Population data. */
  setDistanceCulling(enabled: boolean): VegetationAssemblyDiagnostics {
    if (this._distanceCulling !== enabled) {
      this._distanceCulling = enabled;
      const definition = createLodDefinition(this._token!, this._sourceLibrary!, enabled);
      this._lodInstances = Array.from({ length: this._compiled!.count }, () => definition.createInstance());
      this._applyLod(true);
    }
    return this.getDiagnostics();
  }

  /** Owns a local texture override; null restores each LOD's source texture without changing mesh buffers. */
  setBaseTexture(texture: Texture2D | null, label = ""): VegetationAssemblyDiagnostics {
    if (texture && (texture.width < 1 || texture.height < 1)) throw new Error("Leaf texture has no image data");
    const previous = this._customBaseTexture;
    this._customBaseTexture = texture ? { texture, label } : null;
    const atoms = this._sourceAtoms(this._token!);
    this._batches.forEach((batch, lod) => {
      const next = texture ?? atoms[lod].renderer.material.shaderData.getTexture(BASE_TEXTURE);
      batch.material.shaderData.setTexture(BASE_TEXTURE, next);
      if (next) batch.material.shaderData.enableMacro(BASE_TEXTURE_MACRO);
      else batch.material.shaderData.disableMacro(BASE_TEXTURE_MACRO);
    });
    if (previous && previous.texture !== texture) previous.texture.destroy();
    return this.getDiagnostics();
  }

  /**
   * Changes shadow casting without rebuilding instance data.
   * @param enabled Global Demo shadow toggle.
   * @returns Updated runtime evidence.
   */
  setShadows(enabled: boolean): VegetationAssemblyDiagnostics {
    this._shadows = enabled;
    for (const batch of this._batches) {
      for (const renderer of batch.renderers) renderer.castShadows = enabled && batch.authoredCastShadows;
    }
    return this.getDiagnostics();
  }

  /**
   * Replays this category's bottom-up reveal.
   * @param durationMs Positive animation duration.
   * @returns Promise resolved after all current batches are visible.
   */
  playEntranceEffect(durationMs = ASSET_ASSEMBLY_ENTRANCE_DURATION_MS): Promise<void> {
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      return Promise.reject(new RangeError("Asset entrance duration must be positive"));
    }
    const playback = ++this._playback;
    this._setReveal(0);
    return new Promise((resolve) => {
      let start: number | undefined;
      const advance = (now: number): void => {
        if (playback !== this._playback) return resolve();
        start ??= now;
        const progress = Math.min(1, (now - start) / durationMs);
        this._setReveal(progress);
        progress >= 1 ? resolve() : requestAnimationFrame(advance);
      };
      requestAnimationFrame(advance);
    });
  }

  /** @returns Detached population, draw, authored-source, and LOD evidence. */
  getDiagnostics(): VegetationAssemblyDiagnostics {
    if (!this._token || !this._compiled) throw new Error("Vegetation Assembly runtime is unavailable");
    const authoredLeafCounts = this._token.category === "shrub" ? this._sourceLibrary!.shrub.authoredLeafCounts : [];
    const baseTexture = this._batches[0]?.material.shaderData.getTexture(BASE_TEXTURE) as Texture2D | undefined;
    return {
      category: this._token.category,
      uniformScale: this._uniformScale,
      population: assetPopulationMetrics(this._token),
      automaticDistance: this._automaticDistance,
      distanceCulling: this._distanceCulling,
      baseTexture: {
        source: this._customBaseTexture ? "custom" : "preset",
        label:
          this._customBaseTexture?.label ?? this._sourceLibrary![this._token.category]?.label ?? this._token.category,
        width: baseTexture?.width ?? 0,
        height: baseTexture?.height ?? 0
      },
      simulatedDistance: this._simulatedDistance,
      transitioning: this._transitioning,
      draws: this._batches.filter((batch) => batch.count > 0).length,
      instancesByLod: [...this._instancesByLod],
      authoredLeafCounts,
      retainedLeafCounts: [...authoredLeafCounts],
      castsShadows: this._batches.some((batch) => batch.renderers.some((renderer) => renderer.castShadows)),
      receivesShadows: this._batches.every((batch) => batch.renderers.every((renderer) => renderer.receiveShadows)),
      variation: assetPopulationVariationDiagnostics(this._token.rootSeed, this._compiled),
      distanceFade: {
        ...this._distanceFadeProfile(),
        visibleInstances: this._distanceVisibleInstances,
        averageCoverage: this._compiled.count > 0 ? this._distanceCoverageSum / this._compiled.count : 0
      },
      perInstanceEntities: this._instanceRoots.length
    };
  }

  override onUpdate(deltaTime: number): void {
    if (!this._token || !this._respondsToCamera()) return;
    this._elapsedSeconds += deltaTime;
    if (!this._automaticDistance && !this._transitioning) return;
    if (this._automaticDistance && !this._cameraMoved() && !this._transitioning) return;
    this._applyLod(false);
  }

  override onDestroy(): void {
    this._playback++;
    this._batches.forEach(disposeBatch);
    this._customBaseTexture?.texture.destroy();
    this._customBaseTexture = null;
    this._root?.destroy();
    this._batches = [];
    this._instanceRoots = [];
    this._compiled = null;
    this._lodInstances = [];
    this._lodCounts = new Uint32Array(0);
    this._root = null;
    this._camera = null;
    this._sourceLibrary = null;
    this._token = null;
  }

  private _createAtomBatch(
    instanceRoots: readonly Entity[],
    source: ProductionRenderAtom,
    compiled: CompiledPopulationInstances,
    label: string,
    authoredColorRgb: readonly [number, number, number]
  ): VegetationBatch {
    const binding = source.renderer;
    const material = binding.material.clone();
    const authoredLinear = authoredColorRgb.map((channel) => Color.gammaToLinearSpace(channel / 255));
    try {
      // This runtime owns distance coverage, including manual preview distances.
      material.shaderData.setFloat(GRASS_DISTANCE_FADE_ENABLE, 0);
      if (this._customBaseTexture) {
        material.shaderData.setTexture(BASE_TEXTURE, this._customBaseTexture.texture);
        material.shaderData.enableMacro(BASE_TEXTURE_MACRO);
      }
      const renderers = instanceRoots.map((instance, index) => {
        const renderer = instance.createChild(label).addComponent(MeshRenderer);
        renderer.mesh = binding.mesh;
        renderer.setMaterial(material);
        configureRenderer(
          renderer,
          this._shadows,
          binding,
          resolveInstanceRevealRange(compiled, index, binding.mesh.bounds.min.y, binding.mesh.bounds.max.y)
        );
        const offset = index * 16;
        const color = new Vector4(
          compiled.records[offset + 12],
          compiled.records[offset + 13],
          compiled.records[offset + 14],
          1
        );
        renderer.shaderData.setVector4(ASSET_ASSEMBLY_COLOR, color);
        if (material.shader.name === "Terrain/Grass") {
          // Terrain grass consumes the renderer palette, rather than the alpha-card
          // tint. An isolated specimen has a constant field: both endpoints are its
          // authored linear colour times the instance tint, with identity remapping
          // and saturation. The Population buffer contains a relative tint.
          const palette = new Vector4(
            authoredLinear[0] * color.x,
            authoredLinear[1] * color.y,
            authoredLinear[2] * color.z,
            1
          );
          renderer.shaderData.setVector4("renderer_GrassColorFieldTransform", new Vector4(0, 0, 0, 0));
          renderer.shaderData.setVector4("renderer_GrassColorFieldParams", new Vector4(0, 0, 1, 1));
          renderer.shaderData.setVector4("renderer_GrassColorA", palette);
          renderer.shaderData.setVector4("renderer_GrassColorB", palette);
        }
        return renderer;
      });
      return { renderers, material, authoredCastShadows: binding.castShadows, count: 0 };
    } catch (error) {
      material.destroy();
      throw error;
    }
  }

  private _applyLod(snap: boolean): void {
    if (this._batches.length === 0 || !this._camera || !this._token || !this._compiled) return;
    const counts = this._lodCounts;
    counts.fill(0);
    for (const batch of this._batches) for (const renderer of batch.renderers) renderer.enabled = false;
    this._instancesByLod.fill(0);
    this._distanceVisibleInstances = 0;
    this._distanceCoverageSum = 0;
    let transitioning = false;
    let distanceSum = 0;
    const cameraPosition = this._camera.entity.transform.worldPosition;
    this._lastCameraPosition[0] = cameraPosition.x;
    this._lastCameraPosition[1] = cameraPosition.y;
    this._lastCameraPosition[2] = cameraPosition.z;

    if (!this._usesLod()) {
      for (let index = 0; index < this._compiled.count; index++) {
        const distance = this._distanceToInstance(index, cameraPosition);
        distanceSum += distance;
        const distanceFade = this._distanceFade(distance);
        this._distanceCoverageSum += distanceFade;
        if (distanceFade > 0) this._distanceVisibleInstances++;
        if (distanceFade <= 0) continue;
        activateBatchRenderer(this._batches[0], index, 1, distanceFade);
        counts[0]++;
      }
      this._instancesByLod[0] = counts[0];
      if (this._compiled.count > 0) this._simulatedDistance = distanceSum / this._compiled.count;
    } else {
      for (let index = 0; index < this._compiled.count; index++) {
        const distance = this._distanceToInstance(index, cameraPosition);
        distanceSum += distance;
        const distanceFade = this._distanceFade(distance);
        this._distanceCoverageSum += distanceFade;
        if (distanceFade <= 0) continue;
        this._distanceVisibleInstances++;
        const observation = this._lodObservation;
        observation.timeSeconds = this._elapsedSeconds;
        observation.screenRelativeHeight = this._screenRelativeHeight(index, distance);
        const states = snap
          ? this._lodInstances[index].snap(observation)
          : this._lodInstances[index].updateInto(observation, this._lodRendererSetScratch);
        for (let stateIndex = 0; stateIndex < states.length; stateIndex++) {
          const state = states[stateIndex]!;
          transitioning ||= state.crossFading;
          if (state.lodIndex >= this._batches.length) continue;
          if (index >= populationLodInstanceCount(this._token, state.lodIndex, this._compiled.count)) {
            continue;
          }
          const lodFade =
            this._token.category === "rock" ? combineSignedCoverage(state.signedFade, distanceFade) : state.signedFade;
          activateBatchRenderer(
            this._batches[state.lodIndex],
            index,
            lodFade,
            this._token.category === "rock" ? 1 : distanceFade
          );
          counts[state.lodIndex]++;
          this._instancesByLod[state.lodIndex]++;
        }
      }
      if (this._automaticDistance && this._compiled.count > 0) {
        this._simulatedDistance = distanceSum / this._compiled.count;
      }
    }

    for (let lod = 0; lod < this._batches.length; lod++) {
      const batch = this._batches[lod];
      batch.count = counts[lod];
    }
    this._transitioning = transitioning;
  }

  private _sourceAtoms(token: VegetationPopulationToken): readonly ProductionRenderAtom[] {
    const source = this._sourceLibrary![token.category];
    if (!source) throw new Error(`No authored source loaded for ${token.category}`);
    return source.lods;
  }

  private _sourceColor(token: VegetationPopulationToken): readonly [number, number, number] {
    const source = this._sourceLibrary![token.category];
    if (!source) throw new Error(`No authored source loaded for ${token.category}`);
    return source.defaultColorRgb;
  }

  private _validateSourceIdentity(token: VegetationPopulationToken): void {
    const source = this._sourceLibrary!;
    if (token.category === "shrub") {
      if (token.assetId !== source.shrub.id) {
        throw new Error("Shrub Population Token does not resolve to the production catalog");
      }
    } else if (token.assetId !== source[token.category]?.id) {
      throw new Error(`${token.category} Population Token does not resolve to the production catalog`);
    }
  }

  private _usesLod(): boolean {
    return this._token?.category === "shrub" || this._token?.category === "rock";
  }

  private _respondsToCamera(): boolean {
    return this._usesLod() || this._distanceFadeProfile().enabled;
  }

  private _distanceFadeProfile(): ProductionDistanceFade {
    return this._sourceDistanceFade;
  }

  private _distanceFade(distance: number): number {
    return this._distanceCulling ? resolveAssetAssemblyDistanceFade(distance, this._distanceFadeProfile()) : 1;
  }

  private _distanceToInstance(index: number, cameraPosition: Vector3): number {
    if (!this._automaticDistance) return this._simulatedDistance;
    const offset = index * 16;
    const records = this._compiled!.records;
    const profile = this._lodGroupProfile();
    if (profile) {
      const [referenceX, referenceY, referenceZ] = profile.localReferencePoint;
      const scaledX = referenceX * records[offset + 8];
      const scaledZ = referenceZ * records[offset + 10];
      const quaternionY = records[offset + 5];
      const quaternionW = records[offset + 7];
      const sine = 2 * quaternionY * quaternionW;
      const cosine = 1 - 2 * quaternionY * quaternionY;
      return Math.hypot(
        cameraPosition.x - (records[offset] + cosine * scaledX + sine * scaledZ),
        cameraPosition.y - (records[offset + 1] + referenceY * records[offset + 9]),
        cameraPosition.z - (records[offset + 2] - sine * scaledX + cosine * scaledZ)
      );
    }
    return Math.hypot(
      cameraPosition.x - records[offset],
      cameraPosition.y - records[offset + 1],
      cameraPosition.z - records[offset + 2]
    );
  }

  private _screenRelativeHeight(index: number, distance: number): number {
    const profile = this._lodGroupProfile();
    if (!profile) return 1 / Math.max(distance, 0.001);
    const recordOffset = index * 16;
    const records = this._compiled!.records;
    const worldScale = Math.max(
      Math.abs(records[recordOffset + 8]),
      Math.abs(records[recordOffset + 9]),
      Math.abs(records[recordOffset + 10])
    );
    const halfVerticalFovRadians = (this._camera!.fieldOfView * Math.PI) / 360;
    return (profile.size * worldScale) / (2 * Math.max(distance, 0.001) * Math.tan(halfVerticalFovRadians));
  }

  private _lodGroupProfile(): ProductionLodGroupProfile | null {
    return this._token?.category === "shrub"
      ? this._sourceLibrary!.shrub.lodGroup
      : this._token?.category === "rock"
        ? (this._sourceLibrary!.rock?.lodGroup ?? null)
        : null;
  }

  private _cameraMoved(): boolean {
    const position = this._camera?.entity.transform.worldPosition;
    return Boolean(
      position &&
        (Math.abs(position.x - this._lastCameraPosition[0]) > 0.0001 ||
          Math.abs(position.y - this._lastCameraPosition[1]) > 0.0001 ||
          Math.abs(position.z - this._lastCameraPosition[2]) > 0.0001)
    );
  }

  private _setReveal(progress: number): void {
    for (let index = 0; index < this._batches.length; index++) {
      for (const renderer of this._batches[index]!.renderers) renderer.shaderData.setFloat(REVEAL_PROGRESS, progress);
    }
  }
}

function configureRenderer(
  renderer: MeshRenderer,
  shadows: boolean,
  binding: ProductionRenderAtom["renderer"],
  revealRange: AssetAssemblyRevealRange
): void {
  renderer.castShadows = shadows && binding.castShadows;
  renderer.receiveShadows = binding.receiveShadows;
  renderer.enableVertexColor = binding.enableVertexColor;
  renderer.enabled = false;
  configureAssetAssemblyRendererInstance(renderer);
  renderer.shaderData.setFloat(LOD_FADE, 1);
  renderer.shaderData.enableMacro(LOD_DITHER_MACRO);
  renderer.shaderData.enableMacro(GENERATION_REVEAL_MACRO);
  renderer.shaderData.setFloat(REVEAL_PROGRESS, 1);
  renderer.shaderData.setFloat(REVEAL_ORIGIN_Y, revealRange.minimumY);
  renderer.shaderData.setFloat(REVEAL_HEIGHT, revealRange.height);
  renderer.shaderData.setFloat(REVEAL_LIFT, 0.8);
}

function combineSignedCoverage(lodFade: number, distanceFade: number): number {
  return Math.sign(lodFade || 1) * Math.min(Math.abs(lodFade), distanceFade);
}

function createLodDefinition(
  token: VegetationPopulationToken,
  sourceLibrary: AssetAssemblySourceLibrary,
  distanceCulling: boolean
): TerrainLodGroupRuntime {
  const source = sourceLibrary[token.category];
  if (!source) throw new Error(`No authored source loaded for ${token.category}`);
  const lodCount = source.lods.length;
  if (lodCount < 1) throw new RangeError("Vegetation Assembly requires at least one authored LOD");
  const sourceLodGroup =
    token.category === "shrub"
      ? sourceLibrary.shrub.lodGroup
      : token.category === "rock"
        ? sourceLibrary.rock?.lodGroup
        : null;
  if (sourceLodGroup && sourceLodGroup.screenRelativeTransitionHeights.length !== lodCount) {
    throw new RangeError("Vegetation Assembly LODGroup thresholds must match its authored LODs");
  }
  return new TerrainLodGroupRuntime(
    {
      fadeMode: "CrossFade",
      animateCrossFading: true,
      localReferencePoint: sourceLodGroup ? [...sourceLodGroup.localReferencePoint] : [0, 0, 0],
      size: sourceLodGroup?.size ?? 1,
      lods: sourceLodGroup
        ? resolveAssetAssemblyLodHeights(sourceLodGroup.screenRelativeTransitionHeights, distanceCulling).map(
            (screenRelativeTransitionHeight) => ({ screenRelativeTransitionHeight })
          )
        : lodCount === 2
          ? [{ screenRelativeTransitionHeight: 1 / 16 }, { screenRelativeTransitionHeight: 0 }]
          : [{ screenRelativeTransitionHeight: 0 }]
    },
    CROSS_FADE_SECONDS
  );
}

function setInstanceTransform(instance: Entity, compiled: CompiledPopulationInstances, index: number): void {
  const offset = index * 16;
  const records = compiled.records;
  instance.transform.setPosition(records[offset], records[offset + 1], records[offset + 2]);
  instance.transform.setRotationQuaternion(
    records[offset + 4],
    records[offset + 5],
    records[offset + 6],
    records[offset + 7]
  );
  instance.transform.setScale(records[offset + 8], records[offset + 9], records[offset + 10]);
}

function resolveInstanceRevealRange(
  compiled: CompiledPopulationInstances,
  index: number,
  localMinimumY: number,
  localMaximumY: number
): AssetAssemblyRevealRange {
  const offset = index * 16;
  const positionY = compiled.records[offset + 1];
  const scaleY = compiled.records[offset + 9];
  return {
    minimumY: positionY + localMinimumY * scaleY,
    height: Math.max(0.001, (localMaximumY - localMinimumY) * scaleY)
  };
}

function activateBatchRenderer(batch: VegetationBatch, index: number, signedFade: number, distanceFade: number): void {
  const renderer = batch.renderers[index];
  renderer.shaderData.setFloat(LOD_FADE, signedFade);
  renderer.entity.transform.setScale(distanceFade, distanceFade, distanceFade);
  renderer.enabled = true;
}

function disposeBatch(batch: VegetationBatch): void {
  for (const renderer of batch.renderers) {
    renderer.mesh = null!;
    renderer.setMaterials([]);
  }
  batch.material.destroy();
}

function detachToken(token: VegetationPopulationToken): VegetationPopulationToken {
  return {
    ...token,
    colorRgb: [...token.colorRgb] as [number, number, number],
    population: { ...token.population, extentCells: [...token.population.extentCells] as [number, number] },
    extensions: token.extensions.map((extension) => ({ ...extension })),
    lodProfile: { ...token.lodProfile, values: [...token.lodProfile.values] }
  } as VegetationPopulationToken;
}
