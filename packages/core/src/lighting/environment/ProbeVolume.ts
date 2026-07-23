import { Matrix, SphericalHarmonics3, Vector3, Vector4 } from "@galacean/engine-math";
import { Engine } from "../../Engine";
import { ShaderData } from "../../shader/ShaderData";
import { ShaderProperty } from "../../shader/ShaderProperty";
import { Texture2DArray } from "../../texture/Texture2DArray";
import { TextureFilterMode } from "../../texture/enums/TextureFilterMode";
import { TextureFormat } from "../../texture/enums/TextureFormat";
import { TextureWrapMode } from "../../texture/enums/TextureWrapMode";
import { ProbeVolumeSamplingMode } from "./ProbeVolumeSamplingMode";

const _halfF32 = new Float32Array(1);
const _halfI32 = new Int32Array(_halfF32.buffer);
const _l1CoefficientCount = 12;
const _probeDataStride = 16;
const _webGL2MinimumArrayTextureLayers = 256;
const _maximumActiveCells = 16;

/** Number of cells covered by a probe brick on each axis. */
export const ProbeBrickCellCount = 3;
/** Number of probes stored by a probe brick on each axis. */
export const ProbeBrickProbeCountPerDimension = ProbeBrickCellCount + 1;
/** Total number of probes stored by one brick. */
export const ProbeBrickProbeCount =
  ProbeBrickProbeCountPerDimension * ProbeBrickProbeCountPerDimension * ProbeBrickProbeCountPerDimension;
/** Width and height of the octahedral visibility map stored by each probe. */
export const ProbeVisibilityResolution = 8;

/** Probe brick data. Probe SH order is x-fastest, then y, then z. */
export interface ProbeBrickData {
  /** Brick minimum corner in probe-local space. */
  position: Vector3;
  /** Brick size is `minBrickSize * 3 ^ subdivisionLevel`. */
  subdivisionLevel: number;
  /** 4 x 4 x 4 incoming-radiance SH probes. */
  sphericalHarmonics: SphericalHarmonics3[];
  /** Optional bake-time directional first-hit distances. Not uploaded at runtime. */
  visibility?: Float32Array[];
  /** Optional bake-time probe confidence in the range [0, 1]. */
  validity?: Float32Array;
  /**
   * Pre-convolved directional sky occlusion for each probe.
   * Four values are stored per probe in constant, y, z, x order.
   */
  skyOcclusionSH?: Float32Array;
}

/** Serializable probe brick data. */
export interface ProbeBrickDataJSON {
  position: Vector3 | number[] | { x: number; y: number; z: number };
  subdivisionLevel: number;
  sphericalHarmonics: (SphericalHarmonics3 | number[])[];
  visibility?: (Float32Array | number[])[];
  validity?: Float32Array | number[];
  skyOcclusionSH?: Float32Array | number[];
}

/** Independently streamable group of probe bricks. */
export interface ProbeVolumeCellData {
  /** Integer cell coordinate in probe-local space. */
  coordinate: Vector3;
  bricks: ProbeBrickData[];
}

/** Serializable independently streamable probe cell. */
export interface ProbeVolumeCellDataJSON {
  coordinate: Vector3 | number[] | { x: number; y: number; z: number };
  bricks: ProbeBrickDataJSON[];
}

/** Serializable probe volume data. */
export interface ProbeVolumeJSON {
  version?: number;
  minBrickSize: number;
  bricks?: ProbeBrickDataJSON[];
  cellSize?: number;
  cells?: ProbeVolumeCellDataJSON[];
  localToWorldMatrix?: Matrix | number[];
  normalBias?: number;
  viewBias?: number;
  /** @deprecated Visibility is resolved by the offline lightmapper. */
  visibilityBias?: number;
}

/** Scenario-specific probe irradiance, indexed by cell, brick, then probe. */
export type ProbeVolumeLightingScenarioData = SphericalHarmonics3[][][];

interface ProbeVolumeRuntimeResources {
  shRTexture: Texture2DArray | null;
  shGTexture: Texture2DArray | null;
  shBTexture: Texture2DArray | null;
  skyTexture: Texture2DArray | null;
  cells: RuntimeProbeCell[];
  targetCells: RuntimeProbeCell[] | null;
  hasScenarioTarget: boolean;
  atlasDimensions: Vector3;
  inverseSpacing: number;
  cellOrigins: Float32Array;
  cellParameters: Float32Array;
}

interface RuntimeProbeCell {
  origin: Vector3;
  dimensions: Vector3;
  atlasYOffset: number;
  probeData: Float32Array;
}

/**
 * Diffuse probe volume data and WebGL2 GPU resources.
 * @remarks Runtime sampling uses three L0/L1 SH texture arrays. Active and target lighting scenarios share
 * texture samplers and occupy separate array-layer ranges so SH blending stays on the GPU without increasing
 * sampler pressure. Visibility, dilation and invalid-probe repair are bake-time operations.
 */
export class ProbeVolume {
  private static _enableMacro = "SCENE_USE_PROBE_VOLUME";
  private static _perRendererMacro = "SCENE_PROBE_VOLUME_PER_RENDERER";
  private static _perVertexMacro = "SCENE_PROBE_VOLUME_PER_VERTEX";
  private static _scenarioBlendMacro = "SCENE_PROBE_VOLUME_SCENARIO_BLEND";
  private static _shRTextureProperty = ShaderProperty.getByName("scene_ProbeVolumeSHRTexture");
  private static _shGTextureProperty = ShaderProperty.getByName("scene_ProbeVolumeSHGTexture");
  private static _shBTextureProperty = ShaderProperty.getByName("scene_ProbeVolumeSHBTexture");
  private static _scenarioBlendProperty = ShaderProperty.getByName("scene_ProbeVolumeScenarioBlend");
  private static _scenarioLayerOffsetProperty = ShaderProperty.getByName("scene_ProbeVolumeScenarioLayerOffset");
  private static _skyTextureProperty = ShaderProperty.getByName("scene_ProbeVolumeSkyTexture");
  private static _cellOriginsProperty = ShaderProperty.getByName("scene_ProbeVolumeCellOrigins");
  private static _cellParametersProperty = ShaderProperty.getByName("scene_ProbeVolumeCellParameters");
  private static _cellCountProperty = ShaderProperty.getByName("scene_ProbeVolumeCellCount");
  private static _atlasDimensionsProperty = ShaderProperty.getByName("scene_ProbeVolumeAtlasDimensions");
  private static _inverseSpacingProperty = ShaderProperty.getByName("scene_ProbeVolumeInverseSpacing");
  private static _normalBiasProperty = ShaderProperty.getByName("scene_ProbeVolumeNormalBias");
  private static _viewBiasProperty = ShaderProperty.getByName("scene_ProbeVolumeViewBias");
  private static _worldToLocalProperty = ShaderProperty.getByName("scene_ProbeVolumeWorldToLocal");
  private static _localToWorldProperty = ShaderProperty.getByName("scene_ProbeVolumeLocalToWorld");
  private static _rendererSHRProperty = ShaderProperty.getByName("renderer_ProbeVolumeSHR");
  private static _rendererSHGProperty = ShaderProperty.getByName("renderer_ProbeVolumeSHG");
  private static _rendererSHBProperty = ShaderProperty.getByName("renderer_ProbeVolumeSHB");
  private static _rendererSkyProperty = ShaderProperty.getByName("renderer_ProbeVolumeSky");
  private static _rendererWeightProperty = ShaderProperty.getByName("renderer_ProbeVolumeWeight");
  private static _rendererLocalPosition = new Vector3();
  private static _rendererSample = new Float32Array(_probeDataStride);
  private static _rendererTargetSample = new Float32Array(_probeDataStride);

  /** Smallest brick size in probe-local units. */
  minBrickSize: number;
  /** Sampling offset along the surface normal in world units. */
  normalBias: number;
  /** Sampling offset along the view direction in world units. */
  viewBias: number;
  /** @deprecated Visibility is resolved by the offline lightmapper. */
  visibilityBias: number;
  /** Probe bricks. */
  bricks: ProbeBrickData[];
  /** Independently streamable probe cells. */
  cells: ProbeVolumeCellData[];
  /** Size of one streaming cell in probe-local units. */
  cellSize: number;
  private _samplingMode: ProbeVolumeSamplingMode = ProbeVolumeSamplingMode.PerVertex;
  /** Maximum Chebyshev distance, in cells, loaded around the streaming anchor. */
  streamingRadius = 1;
  /** Maximum number of cells resident on the GPU. */
  maxActiveCells = _maximumActiveCells;

  private _localToWorldMatrix: Matrix;
  private _worldToLocalMatrix = new Matrix();
  private _engine: Engine | null = null;
  private _resources: ProbeVolumeRuntimeResources | null = null;
  private _streamingAnchor = new Vector3();
  private _hasStreamingAnchor = false;
  private _activeCellIndices: number[] = [];
  private _lightingScenarios = new Map<string, ProbeVolumeLightingScenarioData>();
  private _lightingScenario: string;
  private _scenarioBlendTarget: string | null = null;
  private _scenarioBlendingFactor = 0;
  private _dirty = true;

  /**
   * Create a probe volume.
   * @param minBrickSize - Smallest brick size in probe-local units
   * @param bricks - Probe bricks in probe-local space
   * @param localToWorldMatrix - Transform from probe-local space to world space
   * @param lightingScenario - Name assigned to the initial baked lighting data
   */
  constructor(
    minBrickSize: number,
    bricks: ProbeBrickData[] = [],
    localToWorldMatrix: Matrix = new Matrix(),
    lightingScenario: string = "Default"
  ) {
    if (!(minBrickSize > 0)) {
      throw new Error("ProbeVolume minBrickSize must be greater than zero.");
    }
    validateLightingScenarioName(lightingScenario);
    this.minBrickSize = minBrickSize;
    this.normalBias = minBrickSize * 0.05;
    this.viewBias = 0;
    this.visibilityBias = minBrickSize * 0.05;
    this.bricks = normalizeBricks(bricks);
    this.cellSize = minBrickSize * 12;
    this.cells = partitionBricks(this.bricks, this.cellSize);
    this._localToWorldMatrix = localToWorldMatrix.clone();
    this._lightingScenario = lightingScenario;
    this._resetLightingScenarios(lightingScenario);
    this._validateTransform();
    this._selectActiveCells();
  }

  /** Transform from probe-local space to world space. Re-bake lighting after changing it. */
  get localToWorldMatrix(): Matrix {
    return this._localToWorldMatrix;
  }

  set localToWorldMatrix(value: Matrix) {
    if (Math.abs(value.determinant()) < 1e-8) {
      throw new Error("ProbeVolume localToWorldMatrix must be invertible.");
    }
    this._localToWorldMatrix.copyFrom(value);
  }

  /** Runtime sampling quality. Per-vertex is the mobile default. */
  get samplingMode(): ProbeVolumeSamplingMode {
    return this._samplingMode;
  }

  set samplingMode(value: ProbeVolumeSamplingMode) {
    if (this._samplingMode !== value) {
      this._samplingMode = value;
      this._dirty = true;
    }
  }

  /** Names of all baked lighting scenarios in this volume. */
  get lightingScenarioNames(): readonly string[] {
    return Array.from(this._lightingScenarios.keys());
  }

  /** Active baked lighting scenario. */
  get lightingScenario(): string {
    return this._lightingScenario;
  }

  set lightingScenario(value: string) {
    validateLightingScenarioName(value);
    if (!this._lightingScenarios.has(value)) {
      throw new Error(`ProbeVolume lighting scenario "${value}" does not exist.`);
    }
    if (this._lightingScenario === value && this._scenarioBlendTarget === null) {
      return;
    }
    this._lightingScenario = value;
    this._scenarioBlendTarget = null;
    this._scenarioBlendingFactor = 0;
    this._applyLightingScenarioToBricks(value);
    this._dirty = true;
  }

  /** Target scenario currently blended with the active scenario. */
  get scenarioBlendTarget(): string | null {
    return this._scenarioBlendTarget;
  }

  /** Blend weight from the active scenario to the target scenario. */
  get scenarioBlendingFactor(): number {
    return this._scenarioBlendingFactor;
  }

  /**
   * Add or replace a lighting scenario while retaining this volume's shared probe layout.
   * @remarks The source may use different cell partitioning, but every brick and probe position must match.
   */
  addLightingScenario(name: string, source: ProbeVolume): void {
    validateLightingScenarioName(name);
    this._validateScenarioSource(source);
    const sourceScenario = source._getLightingScenarioData(source._lightingScenario);
    const sourceBricks = new Map<string, SphericalHarmonics3[]>();
    for (let cellIndex = 0; cellIndex < source.cells.length; cellIndex++) {
      const cell = source.cells[cellIndex];
      const scenarioCell = sourceScenario[cellIndex];
      for (let brickIndex = 0; brickIndex < cell.bricks.length; brickIndex++) {
        const key = getBrickLayoutKey(cell.bricks[brickIndex]);
        if (sourceBricks.has(key)) {
          throw new Error(`ProbeVolume lighting scenario "${name}" contains duplicate brick layout ${key}.`);
        }
        sourceBricks.set(key, scenarioCell[brickIndex]);
      }
    }

    const scenario = this.cells.map((cell) =>
      cell.bricks.map((brick) => {
        const probes = sourceBricks.get(getBrickLayoutKey(brick));
        if (!probes) {
          throw new Error(`ProbeVolume lighting scenario "${name}" does not match the shared probe layout.`);
        }
        return probes.map((probe) => probe.clone());
      })
    );
    if (sourceBricks.size !== this.bricks.length) {
      throw new Error(`ProbeVolume lighting scenario "${name}" does not match the shared probe layout.`);
    }

    this._lightingScenarios.set(name, scenario);
    if (name === this._lightingScenario) {
      this._applyLightingScenarioToBricks(name);
    }
    if (name === this._lightingScenario || name === this._scenarioBlendTarget) {
      this._dirty = true;
    }
  }

  /** Rename a lighting scenario without duplicating its baked probe data. */
  renameLightingScenario(name: string, newName: string): void {
    validateLightingScenarioName(name);
    validateLightingScenarioName(newName);
    if (!this._lightingScenarios.has(name)) {
      throw new Error(`ProbeVolume lighting scenario "${name}" does not exist.`);
    }
    if (name === newName) {
      return;
    }
    if (this._lightingScenarios.has(newName)) {
      throw new Error(`ProbeVolume lighting scenario "${newName}" already exists.`);
    }
    if (name === this._lightingScenario) {
      this._syncActiveLightingScenario();
    }

    const renamedScenarios = new Map<string, ProbeVolumeLightingScenarioData>();
    for (const [scenarioName, data] of this._lightingScenarios) {
      renamedScenarios.set(scenarioName === name ? newName : scenarioName, data);
    }
    this._lightingScenarios = renamedScenarios;
    if (this._lightingScenario === name) {
      this._lightingScenario = newName;
    }
    if (this._scenarioBlendTarget === name) {
      this._scenarioBlendTarget = newName;
    }
  }

  /**
   * Blend the active lighting scenario toward another baked scenario.
   * @remarks Per-fragment and per-vertex modes blend SH coefficients on the GPU.
   */
  blendLightingScenario(target: string, factor: number): void {
    validateLightingScenarioName(target);
    if (!this._lightingScenarios.has(target)) {
      throw new Error(`ProbeVolume lighting scenario "${target}" does not exist.`);
    }
    if (!Number.isFinite(factor)) {
      throw new Error("ProbeVolume lighting scenario blend factor must be finite.");
    }
    factor = Math.max(0, Math.min(1, factor));
    if (target === this._lightingScenario || factor === 0) {
      if (this._scenarioBlendTarget !== null) {
        this._scenarioBlendTarget = null;
        this._scenarioBlendingFactor = 0;
        this._dirty = true;
      }
      return;
    }
    if (factor === 1) {
      this.lightingScenario = target;
      return;
    }
    if (this._scenarioBlendTarget !== target) {
      this._scenarioBlendTarget = target;
      this._dirty = true;
    }
    this._scenarioBlendingFactor = factor;
  }

  /** Replace all brick data and rebuild GPU resources before the next render. */
  setBricks(bricks: ProbeBrickData[]): void {
    this.bricks = normalizeBricks(bricks);
    this.cells = partitionBricks(this.bricks, this.cellSize);
    this._resetLightingScenarios(this._lightingScenario);
    this._selectActiveCells();
    this._dirty = true;
  }

  /** Replace streamable cells and rebuild runtime resources before the next render. */
  setCells(cells: ProbeVolumeCellData[], cellSize: number = this.cellSize): void {
    if (!(cellSize > 0)) {
      throw new Error("ProbeVolume cellSize must be greater than zero.");
    }
    this.cellSize = cellSize;
    this.cells = normalizeCells(cells);
    this.bricks = this.cells.flatMap((cell) => cell.bricks);
    this._resetLightingScenarios(this._lightingScenario);
    this._selectActiveCells();
    this._dirty = true;
  }

  /** Select nearby streamable cells around a world-space anchor. */
  updateStreamingAnchor(position: Vector3): void {
    Matrix.invert(this._localToWorldMatrix, this._worldToLocalMatrix);
    Vector3.transformCoordinate(position, this._worldToLocalMatrix, this._streamingAnchor);
    this._hasStreamingAnchor = true;
    if (this._selectActiveCells()) {
      this._dirty = true;
    }
  }

  /** Mark mutated brick SH data for GPU re-upload. */
  markDirty(): void {
    this._syncActiveLightingScenario();
    this._dirty = true;
  }

  /** Release textures owned by this volume. Detach it from its scene first. */
  dispose(): void {
    this._releaseResources();
    this._engine = null;
  }

  /** Create a probe volume from serialized brick data. */
  static fromJSON(data: ProbeVolumeJSON): ProbeVolume {
    const volume = new ProbeVolume(
      data.minBrickSize,
      (data.bricks || []).map(parseBrickJSON),
      toMatrix(data.localToWorldMatrix)
    );
    if (data.cells) {
      volume.setCells(
        data.cells.map((cell) => ({
          coordinate: toVector3(cell.coordinate),
          bricks: cell.bricks.map(parseBrickJSON)
        })),
        data.cellSize ?? volume.cellSize
      );
    } else if (data.cellSize) {
      volume.cellSize = data.cellSize;
      volume.setBricks(volume.bricks);
    }
    volume.normalBias = data.normalBias ?? volume.normalBias;
    volume.viewBias = data.viewBias ?? volume.viewBias;
    volume.visibilityBias = data.visibilityBias ?? volume.visibilityBias;
    return volume;
  }

  /** @internal */
  _getLightingScenarioData(name: string): ProbeVolumeLightingScenarioData {
    if (name === this._lightingScenario) {
      this._syncActiveLightingScenario();
    }
    const scenario = this._lightingScenarios.get(name);
    if (!scenario) {
      throw new Error(`ProbeVolume lighting scenario "${name}" does not exist.`);
    }
    return scenario;
  }

  /** @internal */
  _replaceLightingScenarios(
    scenarios: ReadonlyMap<string, ProbeVolumeLightingScenarioData>,
    activeScenario: string
  ): void {
    if (!scenarios.has(activeScenario) || scenarios.size === 0) {
      throw new Error("ProbeVolume lighting scenarios must include the active scenario.");
    }
    const normalized = new Map<string, ProbeVolumeLightingScenarioData>();
    scenarios.forEach((scenario, name) => {
      validateLightingScenarioName(name);
      validateLightingScenarioData(this.cells, scenario, name);
      normalized.set(name, cloneLightingScenarioData(scenario));
    });
    this._lightingScenarios = normalized;
    this._lightingScenario = activeScenario;
    this._scenarioBlendTarget = null;
    this._scenarioBlendingFactor = 0;
    this._applyLightingScenarioToBricks(activeScenario);
    this._dirty = true;
  }

  /** @internal */
  _updateShaderData(engine: Engine, shaderData: ShaderData): boolean {
    if (
      (!engine._hardwareRenderer.isWebGL2 && this.samplingMode !== ProbeVolumeSamplingMode.PerRenderer) ||
      this.bricks.length === 0
    ) {
      this._unbindShaderData(shaderData);
      return false;
    }
    if (this._engine && this._engine !== engine) {
      throw new Error("ProbeVolume GPU resources cannot be shared by different engines.");
    }

    const resources = this._resources;
    if (
      resources &&
      [resources.shRTexture, resources.shGTexture, resources.shBTexture, resources.skyTexture].some(
        (texture) => texture?.isContentLost
      )
    ) {
      this._dirty = true;
    }

    if (this._dirty || !this._resources) {
      this._unbindShaderData(shaderData);
      this._releaseResources();
      this._engine = engine;
      this._resources = this._createResources(engine);
      this._dirty = false;
    }

    this._bindShaderData(shaderData, this._resources);
    return true;
  }

  /** @internal */
  _unbindShaderData(shaderData: ShaderData): void {
    shaderData.disableMacro(ProbeVolume._enableMacro);
    shaderData.disableMacro(ProbeVolume._perRendererMacro);
    shaderData.disableMacro(ProbeVolume._perVertexMacro);
    shaderData.disableMacro(ProbeVolume._scenarioBlendMacro);
    shaderData.setTexture(ProbeVolume._shRTextureProperty, null);
    shaderData.setTexture(ProbeVolume._shGTextureProperty, null);
    shaderData.setTexture(ProbeVolume._shBTextureProperty, null);
    shaderData.setTexture(ProbeVolume._skyTextureProperty, null);
  }

  /** @internal */
  _updateRendererShaderData(shaderData: ShaderData, position: Vector3): void {
    if (this.samplingMode !== ProbeVolumeSamplingMode.PerRenderer || !this._resources) {
      return;
    }
    Matrix.invert(this._localToWorldMatrix, this._worldToLocalMatrix);
    const localPosition = ProbeVolume._rendererLocalPosition;
    Vector3.transformCoordinate(position, this._worldToLocalMatrix, localPosition);
    const sample = ProbeVolume._rendererSample;
    const weight = sampleRuntimeCells(this._resources.cells, this._resources.inverseSpacing, localPosition, sample);
    const targetCells = this._resources.targetCells;
    if (targetCells) {
      const targetSample = ProbeVolume._rendererTargetSample;
      sampleRuntimeCells(targetCells, this._resources.inverseSpacing, localPosition, targetSample);
      const blend = this._scenarioBlendingFactor;
      for (let coefficient = 0; coefficient < _l1CoefficientCount; coefficient++) {
        sample[coefficient] += (targetSample[coefficient] - sample[coefficient]) * blend;
      }
    }
    const shR = getOrCreateVector4(shaderData, ProbeVolume._rendererSHRProperty);
    const shG = getOrCreateVector4(shaderData, ProbeVolume._rendererSHGProperty);
    const shB = getOrCreateVector4(shaderData, ProbeVolume._rendererSHBProperty);
    writeL1Vector(shR, sample, 0);
    writeL1Vector(shG, sample, 1);
    writeL1Vector(shB, sample, 2);
    const sky = getOrCreateVector4(shaderData, ProbeVolume._rendererSkyProperty);
    sky.set(sample[12], sample[13], sample[14], sample[15]);
    shaderData.setFloat(ProbeVolume._rendererWeightProperty, weight);
  }

  private _bindShaderData(shaderData: ShaderData, resources: ProbeVolumeRuntimeResources): void {
    this._validateTransform();
    shaderData.setTexture(ProbeVolume._shRTextureProperty, resources.shRTexture);
    shaderData.setTexture(ProbeVolume._shGTextureProperty, resources.shGTexture);
    shaderData.setTexture(ProbeVolume._shBTextureProperty, resources.shBTexture);
    shaderData.setFloat(ProbeVolume._scenarioBlendProperty, this._scenarioBlendingFactor);
    shaderData.setFloat(ProbeVolume._scenarioLayerOffsetProperty, resources.atlasDimensions.z);
    shaderData.setTexture(ProbeVolume._skyTextureProperty, resources.skyTexture);
    shaderData.setFloatArray(ProbeVolume._cellOriginsProperty, resources.cellOrigins);
    shaderData.setFloatArray(ProbeVolume._cellParametersProperty, resources.cellParameters);
    shaderData.setInt(ProbeVolume._cellCountProperty, resources.cells.length);
    shaderData.setVector3(ProbeVolume._atlasDimensionsProperty, resources.atlasDimensions);
    shaderData.setFloat(ProbeVolume._inverseSpacingProperty, resources.inverseSpacing);
    shaderData.setFloat(ProbeVolume._normalBiasProperty, this.normalBias);
    shaderData.setFloat(ProbeVolume._viewBiasProperty, this.viewBias);
    Matrix.invert(this._localToWorldMatrix, this._worldToLocalMatrix);
    shaderData.setMatrix(ProbeVolume._worldToLocalProperty, this._worldToLocalMatrix);
    shaderData.setMatrix(ProbeVolume._localToWorldProperty, this._localToWorldMatrix);
    shaderData.disableMacro(ProbeVolume._perRendererMacro);
    shaderData.disableMacro(ProbeVolume._perVertexMacro);
    shaderData.disableMacro(ProbeVolume._scenarioBlendMacro);
    if (this.samplingMode === ProbeVolumeSamplingMode.PerRenderer) {
      shaderData.enableMacro(ProbeVolume._perRendererMacro);
    } else if (this.samplingMode === ProbeVolumeSamplingMode.PerVertex) {
      shaderData.enableMacro(ProbeVolume._perVertexMacro);
    }
    if (this.samplingMode !== ProbeVolumeSamplingMode.PerRenderer && resources.hasScenarioTarget) {
      shaderData.enableMacro(ProbeVolume._scenarioBlendMacro);
    }
    shaderData.enableMacro(ProbeVolume._enableMacro);
  }

  private _validateTransform(): void {
    if (Math.abs(this._localToWorldMatrix.determinant()) < 1e-8) {
      throw new Error("ProbeVolume localToWorldMatrix must be invertible.");
    }
  }

  private _createResources(engine: Engine): ProbeVolumeRuntimeResources {
    const activeScenario = this._lightingScenarios.get(this._lightingScenario)!;
    const grids = this._activeCellIndices.map((index) =>
      buildDenseProbeGrid(this.cells[index].bricks, this.minBrickSize, activeScenario[index])
    );
    const targetScenario = this._scenarioBlendTarget
      ? this._lightingScenarios.get(this._scenarioBlendTarget)!
      : undefined;
    const targetGrids = targetScenario
      ? this._activeCellIndices.map((index) =>
          buildDenseProbeGrid(this.cells[index].bricks, this.minBrickSize, targetScenario[index])
        )
      : null;
    if (grids.length === 0) {
      return {
        shRTexture: null,
        shGTexture: null,
        shBTexture: null,
        skyTexture: null,
        cells: [],
        targetCells: targetGrids,
        hasScenarioTarget: targetGrids !== null,
        atlasDimensions: new Vector3(1, 1, 1),
        inverseSpacing: ProbeBrickCellCount / this.minBrickSize,
        cellOrigins: new Float32Array(_maximumActiveCells * 4),
        cellParameters: new Float32Array(_maximumActiveCells * 4)
      };
    }
    const atlasWidth = Math.max(...grids.map((grid) => grid.dimensions.x));
    const atlasHeight = grids.reduce((sum, grid) => sum + grid.dimensions.y, 0);
    const atlasLayers = Math.max(...grids.map((grid) => grid.dimensions.z));
    const atlasDimensions = new Vector3(atlasWidth, atlasHeight, atlasLayers);
    const maxTextureSize = Number(engine._hardwareRenderer.capability.maxTextureSize);
    if (atlasWidth > maxTextureSize || atlasHeight > maxTextureSize) {
      throw new Error(
        `ProbeVolume atlas ${atlasWidth}x${atlasHeight} exceeds the device texture size limit ${maxTextureSize}. Reduce the streaming radius or cell size.`
      );
    }
    const textureLayerCount = atlasLayers * (targetGrids ? 2 : 1);
    if (textureLayerCount > _webGL2MinimumArrayTextureLayers) {
      throw new Error(
        `ProbeVolume scenarios require ${textureLayerCount} array layers; this runtime supports up to ${_webGL2MinimumArrayTextureLayers}.`
      );
    }
    let yOffset = 0;
    for (let i = 0; i < grids.length; i++) {
      const grid = grids[i];
      grid.atlasYOffset = yOffset;
      if (targetGrids) {
        targetGrids[i].atlasYOffset = yOffset;
      }
      yOffset += grid.dimensions.y;
    }
    const { cellOrigins, cellParameters } = createCellMetadata(grids);
    if (this.samplingMode === ProbeVolumeSamplingMode.PerRenderer) {
      return {
        shRTexture: null,
        shGTexture: null,
        shBTexture: null,
        skyTexture: null,
        cells: grids,
        targetCells: targetGrids,
        hasScenarioTarget: targetGrids !== null,
        atlasDimensions,
        inverseSpacing: ProbeBrickCellCount / this.minBrickSize,
        cellOrigins,
        cellParameters
      };
    }
    const atlas = packProbeAtlas(grids, atlasDimensions);
    const targetAtlas = targetGrids ? packProbeAtlas(targetGrids, atlasDimensions) : null;
    const shTextureDimensions = targetAtlas
      ? new Vector3(atlasDimensions.x, atlasDimensions.y, atlasDimensions.z * 2)
      : atlasDimensions;
    return {
      shRTexture: createSHTexture(engine, shTextureDimensions, combineScenarioAtlas(atlas.shR, targetAtlas?.shR)),
      shGTexture: createSHTexture(engine, shTextureDimensions, combineScenarioAtlas(atlas.shG, targetAtlas?.shG)),
      shBTexture: createSHTexture(engine, shTextureDimensions, combineScenarioAtlas(atlas.shB, targetAtlas?.shB)),
      skyTexture: createSkyTexture(engine, atlasDimensions, atlas.sky),
      cells: grids,
      targetCells: targetGrids,
      hasScenarioTarget: targetGrids !== null,
      atlasDimensions,
      inverseSpacing: ProbeBrickCellCount / this.minBrickSize,
      cellOrigins,
      cellParameters
    };
  }

  private _selectActiveCells(): boolean {
    const previous = this._activeCellIndices.join(",");
    const candidates = this.cells.map((cell, index) => {
      const dx = Math.abs(cell.coordinate.x - Math.floor(this._streamingAnchor.x / this.cellSize));
      const dy = Math.abs(cell.coordinate.y - Math.floor(this._streamingAnchor.y / this.cellSize));
      const dz = Math.abs(cell.coordinate.z - Math.floor(this._streamingAnchor.z / this.cellSize));
      return { index, horizontalDistance: Math.max(dx, dz), verticalDistance: dy };
    });
    candidates.sort(
      (a, b) =>
        a.horizontalDistance - b.horizontalDistance || a.verticalDistance - b.verticalDistance || a.index - b.index
    );
    const selected = this._hasStreamingAnchor
      ? candidates.filter((candidate) => candidate.horizontalDistance <= this.streamingRadius)
      : candidates;
    this._activeCellIndices = selected
      .slice(0, Math.min(this.maxActiveCells, _maximumActiveCells))
      .map((candidate) => candidate.index);
    return previous !== this._activeCellIndices.join(",");
  }

  private _releaseResources(): void {
    const resources = this._resources;
    if (!resources) {
      return;
    }
    resources.shRTexture?.destroy(true);
    resources.shGTexture?.destroy(true);
    resources.shBTexture?.destroy(true);
    resources.skyTexture?.destroy(true);
    this._resources = null;
  }

  private _resetLightingScenarios(name: string): void {
    this._lightingScenarios.clear();
    this._lightingScenarios.set(name, captureLightingScenarioData(this.cells));
    this._lightingScenario = name;
    this._scenarioBlendTarget = null;
    this._scenarioBlendingFactor = 0;
  }

  private _syncActiveLightingScenario(): void {
    this._lightingScenarios.set(this._lightingScenario, captureLightingScenarioData(this.cells));
  }

  private _applyLightingScenarioToBricks(name: string): void {
    const scenario = this._lightingScenarios.get(name)!;
    for (let cellIndex = 0; cellIndex < this.cells.length; cellIndex++) {
      const cell = this.cells[cellIndex];
      for (let brickIndex = 0; brickIndex < cell.bricks.length; brickIndex++) {
        cell.bricks[brickIndex].sphericalHarmonics = scenario[cellIndex][brickIndex];
      }
    }
  }

  private _validateScenarioSource(source: ProbeVolume): void {
    if (Math.abs(source.minBrickSize - this.minBrickSize) > 1e-6) {
      throw new Error("ProbeVolume lighting scenario minBrickSize must match the shared probe layout.");
    }
    const sourceMatrix = source.localToWorldMatrix.elements;
    const targetMatrix = this.localToWorldMatrix.elements;
    for (let i = 0; i < 16; i++) {
      if (Math.abs(sourceMatrix[i] - targetMatrix[i]) > 1e-5) {
        throw new Error("ProbeVolume lighting scenario transform must match the shared probe layout.");
      }
    }
    if (source.bricks.length !== this.bricks.length) {
      throw new Error("ProbeVolume lighting scenario brick count must match the shared probe layout.");
    }
  }
}

function buildDenseProbeGrid(
  bricks: ProbeBrickData[],
  minBrickSize: number,
  scenarioBricks?: SphericalHarmonics3[][]
): RuntimeProbeCell {
  const origin = new Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
  const boundsMax = new Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);
  for (let i = 0; i < bricks.length; i++) {
    const brick = bricks[i];
    const size = minBrickSize * Math.pow(ProbeBrickCellCount, brick.subdivisionLevel);
    origin.x = Math.min(origin.x, brick.position.x);
    origin.y = Math.min(origin.y, brick.position.y);
    origin.z = Math.min(origin.z, brick.position.z);
    boundsMax.x = Math.max(boundsMax.x, brick.position.x + size);
    boundsMax.y = Math.max(boundsMax.y, brick.position.y + size);
    boundsMax.z = Math.max(boundsMax.z, brick.position.z + size);
  }

  const inverseSpacing = ProbeBrickCellCount / minBrickSize;
  const dimensions = new Vector3(
    Math.max(2, Math.round((boundsMax.x - origin.x) * inverseSpacing) + 1),
    Math.max(2, Math.round((boundsMax.y - origin.y) * inverseSpacing) + 1),
    Math.max(2, Math.round((boundsMax.z - origin.z) * inverseSpacing) + 1)
  );
  const cellDimensions = new Vector3(
    Math.max(1, Math.ceil((boundsMax.x - origin.x) / minBrickSize)),
    Math.max(1, Math.ceil((boundsMax.y - origin.y) / minBrickSize)),
    Math.max(1, Math.ceil((boundsMax.z - origin.z) / minBrickSize))
  );
  const brickOwners = new Int32Array(cellDimensions.x * cellDimensions.y * cellDimensions.z);
  brickOwners.fill(-1);
  const sortedBrickIndices = bricks
    .map((brick, index) => ({ brick, index }))
    .sort((a, b) => b.brick.subdivisionLevel - a.brick.subdivisionLevel);

  for (let i = 0; i < sortedBrickIndices.length; i++) {
    const { brick, index } = sortedBrickIndices[i];
    const coveredCells = Math.pow(ProbeBrickCellCount, brick.subdivisionLevel);
    const gridX = (brick.position.x - origin.x) / minBrickSize;
    const gridY = (brick.position.y - origin.y) / minBrickSize;
    const gridZ = (brick.position.z - origin.z) / minBrickSize;
    if (!isGridAligned(gridX) || !isGridAligned(gridY) || !isGridAligned(gridZ)) {
      throw new Error(`ProbeVolume brick ${index} is not aligned to minBrickSize ${minBrickSize}.`);
    }
    const startX = Math.round(gridX);
    const startY = Math.round(gridY);
    const startZ = Math.round(gridZ);
    for (let z = 0; z < coveredCells; z++) {
      for (let y = 0; y < coveredCells; y++) {
        for (let x = 0; x < coveredCells; x++) {
          const gx = startX + x;
          const gy = startY + y;
          const gz = startZ + z;
          if (
            gx >= 0 &&
            gy >= 0 &&
            gz >= 0 &&
            gx < cellDimensions.x &&
            gy < cellDimensions.y &&
            gz < cellDimensions.z
          ) {
            brickOwners[gx + cellDimensions.x * (gy + cellDimensions.y * gz)] = index;
          }
        }
      }
    }
  }

  const probeCount = dimensions.x * dimensions.y * dimensions.z;
  const probeData = new Float32Array(probeCount * _probeDataStride);
  const confidenceData = new Float32Array(probeCount);
  for (let z = 0; z < dimensions.z; z++) {
    const localZ = origin.z + z / inverseSpacing;
    const cellZ = Math.min(Math.floor((localZ - origin.z) / minBrickSize), cellDimensions.z - 1);
    for (let y = 0; y < dimensions.y; y++) {
      const localY = origin.y + y / inverseSpacing;
      const cellY = Math.min(Math.floor((localY - origin.y) / minBrickSize), cellDimensions.y - 1);
      for (let x = 0; x < dimensions.x; x++) {
        const localX = origin.x + x / inverseSpacing;
        const cellX = Math.min(Math.floor((localX - origin.x) / minBrickSize), cellDimensions.x - 1);
        const ownerIndex = brickOwners[cellX + cellDimensions.x * (cellY + cellDimensions.y * cellZ)];
        if (ownerIndex < 0) {
          continue;
        }
        const probeIndex = x + dimensions.x * (y + dimensions.y * z);
        confidenceData[probeIndex] = sampleBrickData(
          bricks[ownerIndex],
          scenarioBricks?.[ownerIndex],
          minBrickSize,
          localX,
          localY,
          localZ,
          probeData.subarray(probeIndex * _probeDataStride, (probeIndex + 1) * _probeDataStride)
        );
      }
    }
  }

  dilateInvalidProbeData(probeData, confidenceData, dimensions);

  return { origin, dimensions, atlasYOffset: 0, probeData };
}

function sampleBrickData(
  brick: ProbeBrickData,
  sphericalHarmonics: SphericalHarmonics3[] | undefined,
  minBrickSize: number,
  localX: number,
  localY: number,
  localZ: number,
  out: Float32Array
): number {
  out.fill(0);
  const validityWeighted = new Float32Array(_probeDataStride);
  const brickSize = minBrickSize * Math.pow(ProbeBrickCellCount, brick.subdivisionLevel);
  const probeX = Math.max(
    0,
    Math.min(ProbeBrickCellCount, ((localX - brick.position.x) / brickSize) * ProbeBrickCellCount)
  );
  const probeY = Math.max(
    0,
    Math.min(ProbeBrickCellCount, ((localY - brick.position.y) / brickSize) * ProbeBrickCellCount)
  );
  const probeZ = Math.max(
    0,
    Math.min(ProbeBrickCellCount, ((localZ - brick.position.z) / brickSize) * ProbeBrickCellCount)
  );
  const baseX = Math.min(Math.floor(probeX), ProbeBrickCellCount - 1);
  const baseY = Math.min(Math.floor(probeY), ProbeBrickCellCount - 1);
  const baseZ = Math.min(Math.floor(probeZ), ProbeBrickCellCount - 1);
  const fractionX = probeX - baseX;
  const fractionY = probeY - baseY;
  const fractionZ = probeZ - baseZ;
  let totalValidityWeight = 0;

  for (let z = 0; z < 2; z++) {
    const wz = z === 0 ? 1 - fractionZ : fractionZ;
    for (let y = 0; y < 2; y++) {
      const wy = y === 0 ? 1 - fractionY : fractionY;
      for (let x = 0; x < 2; x++) {
        const wx = x === 0 ? 1 - fractionX : fractionX;
        const probeIndex =
          baseX + x + ProbeBrickProbeCountPerDimension * (baseY + y + ProbeBrickProbeCountPerDimension * (baseZ + z));
        const validity = brick.validity?.[probeIndex] ?? 1;
        const weight = wx * wy * wz;
        const validityWeight = weight * validity;
        const source = (sphericalHarmonics || brick.sphericalHarmonics)[probeIndex].coefficients;
        for (let coefficient = 0; coefficient < _l1CoefficientCount; coefficient++) {
          out[coefficient] += source[coefficient] * weight;
          validityWeighted[coefficient] += source[coefficient] * validityWeight;
        }
        const skyOffset = probeIndex * 4;
        for (let coefficient = 0; coefficient < 4; coefficient++) {
          const value = brick.skyOcclusionSH?.[skyOffset + coefficient] ?? 0;
          out[12 + coefficient] += value * weight;
          validityWeighted[12 + coefficient] += value * validityWeight;
        }
        totalValidityWeight += validityWeight;
      }
    }
  }

  if (totalValidityWeight > 1e-5) {
    for (let coefficient = 0; coefficient < _probeDataStride; coefficient++) {
      out[coefficient] = validityWeighted[coefficient] / totalValidityWeight;
    }
    return Math.min(totalValidityWeight, 1);
  }

  // Some legacy bake outputs contain usable SH data but no valid probes. Keep the
  // unweighted interpolation instead of turning the entire volume black.
  return 0;
}

function dilateInvalidProbeData(data: Float32Array, confidence: Float32Array, dimensions: Vector3): void {
  const confidenceThreshold = 0.5;
  const probeCount = confidence.length;
  const nearestValid = new Int32Array(probeCount);
  const queue = new Int32Array(probeCount);
  nearestValid.fill(-1);
  let head = 0;
  let tail = 0;

  for (let i = 0; i < probeCount; i++) {
    if (confidence[i] >= confidenceThreshold) {
      nearestValid[i] = i;
      queue[tail++] = i;
    }
  }
  if (tail === 0) {
    return;
  }

  const strideY = dimensions.x;
  const strideZ = dimensions.x * dimensions.y;
  while (head < tail) {
    const index = queue[head++];
    const x = index % dimensions.x;
    const y = Math.floor(index / strideY) % dimensions.y;
    const z = Math.floor(index / strideZ);
    if (x > 0) assignNearest(index - 1, index);
    if (x + 1 < dimensions.x) assignNearest(index + 1, index);
    if (y > 0) assignNearest(index - strideY, index);
    if (y + 1 < dimensions.y) assignNearest(index + strideY, index);
    if (z > 0) assignNearest(index - strideZ, index);
    if (z + 1 < dimensions.z) assignNearest(index + strideZ, index);
  }

  const source = data.slice();
  for (let i = 0; i < probeCount; i++) {
    if (confidence[i] >= confidenceThreshold) {
      continue;
    }
    const sourceIndex = nearestValid[i];
    if (sourceIndex < 0) {
      continue;
    }
    const retainedWeight = Math.max(0, confidence[i] / confidenceThreshold);
    const destinationOffset = i * _probeDataStride;
    const sourceOffset = sourceIndex * _probeDataStride;
    for (let coefficient = 0; coefficient < _probeDataStride; coefficient++) {
      data[destinationOffset + coefficient] =
        source[sourceOffset + coefficient] * (1 - retainedWeight) +
        source[destinationOffset + coefficient] * retainedWeight;
    }
  }

  function assignNearest(destination: number, source: number): void {
    if (nearestValid[destination] >= 0) {
      return;
    }
    nearestValid[destination] = nearestValid[source];
    queue[tail++] = destination;
  }
}

function normalizeBricks(bricks: ProbeBrickData[]): ProbeBrickData[] {
  return bricks.map((brick, index) => {
    if (!Number.isInteger(brick.subdivisionLevel) || brick.subdivisionLevel < 0) {
      throw new Error(`ProbeVolume brick ${index} has an invalid subdivisionLevel.`);
    }
    if (brick.sphericalHarmonics.length !== ProbeBrickProbeCount) {
      throw new Error(`ProbeVolume brick ${index} must contain exactly ${ProbeBrickProbeCount} SH probes.`);
    }
    return {
      position: brick.position.clone(),
      subdivisionLevel: brick.subdivisionLevel,
      sphericalHarmonics: brick.sphericalHarmonics.map((sh) => sh.clone()),
      visibility: normalizeVisibility(brick.visibility, index),
      validity: normalizeValidity(brick.validity, index),
      skyOcclusionSH: normalizeSkyOcclusionSH(brick.skyOcclusionSH, index)
    };
  });
}

function captureLightingScenarioData(cells: ProbeVolumeCellData[]): ProbeVolumeLightingScenarioData {
  return cells.map((cell) => cell.bricks.map((brick) => brick.sphericalHarmonics));
}

function cloneLightingScenarioData(scenario: ProbeVolumeLightingScenarioData): ProbeVolumeLightingScenarioData {
  return scenario.map((cell) => cell.map((brick) => brick.map((probe) => probe.clone())));
}

function validateLightingScenarioData(
  cells: ProbeVolumeCellData[],
  scenario: ProbeVolumeLightingScenarioData,
  name: string
): void {
  if (scenario.length !== cells.length) {
    throw new Error(`ProbeVolume lighting scenario "${name}" cell count must match the shared probe layout.`);
  }
  for (let cellIndex = 0; cellIndex < cells.length; cellIndex++) {
    const bricks = cells[cellIndex].bricks;
    const scenarioBricks = scenario[cellIndex];
    if (scenarioBricks.length !== bricks.length) {
      throw new Error(`ProbeVolume lighting scenario "${name}" brick count must match the shared probe layout.`);
    }
    for (let brickIndex = 0; brickIndex < bricks.length; brickIndex++) {
      if (scenarioBricks[brickIndex].length !== ProbeBrickProbeCount) {
        throw new Error(
          `ProbeVolume lighting scenario "${name}" brick ${brickIndex} must contain exactly ${ProbeBrickProbeCount} SH probes.`
        );
      }
    }
  }
}

function validateLightingScenarioName(name: string): void {
  if (!name || name.trim().length === 0) {
    throw new Error("ProbeVolume lighting scenario name must not be empty.");
  }
}

function getBrickLayoutKey(brick: ProbeBrickData): string {
  const position = brick.position;
  return `${roundLayoutCoordinate(position.x)},${roundLayoutCoordinate(position.y)},${roundLayoutCoordinate(
    position.z
  )},${brick.subdivisionLevel}`;
}

function roundLayoutCoordinate(value: number): number {
  return Math.round(value * 1e5);
}

function normalizeCells(cells: ProbeVolumeCellData[]): ProbeVolumeCellData[] {
  return cells.map((cell, index) => {
    const coordinate = cell.coordinate.clone();
    if (![coordinate.x, coordinate.y, coordinate.z].every(Number.isInteger)) {
      throw new Error(`ProbeVolume cell ${index} coordinate must contain integers.`);
    }
    return { coordinate, bricks: normalizeBricks(cell.bricks) };
  });
}

function partitionBricks(bricks: ProbeBrickData[], cellSize: number): ProbeVolumeCellData[] {
  const cells = new Map<string, ProbeVolumeCellData>();
  for (const brick of bricks) {
    const coordinate = new Vector3(
      Math.floor(brick.position.x / cellSize),
      Math.floor(brick.position.y / cellSize),
      Math.floor(brick.position.z / cellSize)
    );
    const key = `${coordinate.x},${coordinate.y},${coordinate.z}`;
    let cell = cells.get(key);
    if (!cell) {
      cell = { coordinate, bricks: [] };
      cells.set(key, cell);
    }
    cell.bricks.push(brick);
  }
  return Array.from(cells.values());
}

function normalizeValidity(validity: Float32Array | undefined, brickIndex: number): Float32Array | undefined {
  if (!validity) {
    return undefined;
  }
  if (validity.length !== ProbeBrickProbeCount) {
    throw new Error(`ProbeVolume brick ${brickIndex} must contain exactly ${ProbeBrickProbeCount} validity values.`);
  }
  const copy = new Float32Array(validity);
  for (let i = 0; i < copy.length; i++) {
    if (!Number.isFinite(copy[i]) || copy[i] < 0 || copy[i] > 1) {
      throw new Error(`ProbeVolume brick ${brickIndex} validity value ${i} must be in the range [0, 1].`);
    }
  }
  return copy;
}

function normalizeSkyOcclusionSH(values: Float32Array | undefined, brickIndex: number): Float32Array | undefined {
  if (!values) {
    return undefined;
  }
  const coefficientCount = ProbeBrickProbeCount * 4;
  if (values.length !== coefficientCount) {
    throw new Error(
      `ProbeVolume brick ${brickIndex} must contain exactly ${coefficientCount} directional sky occlusion values.`
    );
  }
  const copy = new Float32Array(values);
  for (let i = 0; i < copy.length; i++) {
    if (!Number.isFinite(copy[i])) {
      throw new Error(`ProbeVolume brick ${brickIndex} directional sky occlusion value ${i} must be finite.`);
    }
  }
  return copy;
}

function normalizeVisibility(visibility: Float32Array[] | undefined, brickIndex: number): Float32Array[] | undefined {
  if (!visibility) {
    return undefined;
  }
  if (visibility.length !== ProbeBrickProbeCount) {
    throw new Error(`ProbeVolume brick ${brickIndex} must contain exactly ${ProbeBrickProbeCount} visibility probes.`);
  }
  const texelCount = ProbeVisibilityResolution * ProbeVisibilityResolution;
  return visibility.map((distances, probeIndex) => {
    if (distances.length !== texelCount) {
      throw new Error(
        `ProbeVolume brick ${brickIndex} visibility probe ${probeIndex} must contain exactly ${texelCount} distances.`
      );
    }
    return new Float32Array(distances);
  });
}

function createSHTexture(engine: Engine, dimensions: Vector3, data: Uint16Array): Texture2DArray {
  const texture = new Texture2DArray(
    engine,
    dimensions.x,
    dimensions.y,
    dimensions.z,
    TextureFormat.R16G16B16A16,
    false,
    false
  );
  texture.filterMode = TextureFilterMode.Bilinear;
  texture.wrapModeU = texture.wrapModeV = TextureWrapMode.Clamp;
  texture.setPixelBuffer(0, data, 0, 0, 0, dimensions.x, dimensions.y, dimensions.z);
  return texture;
}

function createSkyTexture(engine: Engine, dimensions: Vector3, data: Uint16Array): Texture2DArray {
  const texture = new Texture2DArray(
    engine,
    dimensions.x,
    dimensions.y,
    dimensions.z,
    TextureFormat.R16G16B16A16,
    false,
    false
  );
  texture.filterMode = TextureFilterMode.Bilinear;
  texture.wrapModeU = texture.wrapModeV = TextureWrapMode.Clamp;
  texture.setPixelBuffer(0, data, 0, 0, 0, dimensions.x, dimensions.y, dimensions.z);
  return texture;
}

function packProbeAtlas(
  cells: RuntimeProbeCell[],
  dimensions: Vector3
): { shR: Uint16Array; shG: Uint16Array; shB: Uint16Array; sky: Uint16Array } {
  const texelCount = dimensions.x * dimensions.y * dimensions.z;
  const shR = new Uint16Array(texelCount * 4);
  const shG = new Uint16Array(texelCount * 4);
  const shB = new Uint16Array(texelCount * 4);
  const sky = new Uint16Array(texelCount * 4);
  for (const cell of cells) {
    for (let z = 0; z < cell.dimensions.z; z++) {
      for (let y = 0; y < cell.dimensions.y; y++) {
        for (let x = 0; x < cell.dimensions.x; x++) {
          const sourceIndex = x + cell.dimensions.x * (y + cell.dimensions.y * z);
          const destinationIndex = x + dimensions.x * (y + cell.atlasYOffset + dimensions.y * z);
          const sourceOffset = sourceIndex * _probeDataStride;
          const destinationOffset = destinationIndex * 4;
          const values = cell.probeData.subarray(sourceOffset, sourceOffset + _probeDataStride);
          writeL1Channel(shR, destinationOffset, values, 0);
          writeL1Channel(shG, destinationOffset, values, 1);
          writeL1Channel(shB, destinationOffset, values, 2);
          sky[destinationOffset] = toHalf(values[12]);
          sky[destinationOffset + 1] = toHalf(values[13]);
          sky[destinationOffset + 2] = toHalf(values[14]);
          sky[destinationOffset + 3] = toHalf(values[15]);
        }
      }
    }
  }
  return { shR, shG, shB, sky };
}

function combineScenarioAtlas(active: Uint16Array, target?: Uint16Array): Uint16Array {
  if (!target) {
    return active;
  }
  const combined = new Uint16Array(active.length + target.length);
  combined.set(active);
  combined.set(target, active.length);
  return combined;
}

function createCellMetadata(cells: RuntimeProbeCell[]): { cellOrigins: Float32Array; cellParameters: Float32Array } {
  const cellOrigins = new Float32Array(_maximumActiveCells * 4);
  const cellParameters = new Float32Array(_maximumActiveCells * 4);
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    const offset = i * 4;
    cellOrigins[offset] = cell.origin.x;
    cellOrigins[offset + 1] = cell.origin.y;
    cellOrigins[offset + 2] = cell.origin.z;
    cellParameters[offset] = cell.dimensions.x;
    cellParameters[offset + 1] = cell.dimensions.y;
    cellParameters[offset + 2] = cell.dimensions.z;
    cellParameters[offset + 3] = cell.atlasYOffset;
  }
  return { cellOrigins, cellParameters };
}

function sampleRuntimeCells(
  cells: RuntimeProbeCell[],
  inverseSpacing: number,
  position: Vector3,
  out: Float32Array
): number {
  out.fill(0);
  let selectedCell: RuntimeProbeCell | undefined;
  let selectedX = 0;
  let selectedY = 0;
  let selectedZ = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const cell of cells) {
    const px = (position.x - cell.origin.x) * inverseSpacing;
    const py = (position.y - cell.origin.y) * inverseSpacing;
    const pz = (position.z - cell.origin.z) * inverseSpacing;
    const cx = Math.max(0, Math.min(cell.dimensions.x - 1, px));
    const cy = Math.max(0, Math.min(cell.dimensions.y - 1, py));
    const cz = Math.max(0, Math.min(cell.dimensions.z - 1, pz));
    const distance = Math.hypot(px - cx, py - cy, pz - cz);
    if (distance <= 1 && distance < nearestDistance) {
      selectedCell = cell;
      selectedX = cx;
      selectedY = cy;
      selectedZ = cz;
      nearestDistance = distance;
    }
  }
  if (selectedCell) {
    const x0 = Math.min(Math.floor(selectedX), selectedCell.dimensions.x - 2);
    const y0 = Math.min(Math.floor(selectedY), selectedCell.dimensions.y - 2);
    const z0 = Math.min(Math.floor(selectedZ), selectedCell.dimensions.z - 2);
    const fx = selectedX - x0;
    const fy = selectedY - y0;
    const fz = selectedZ - z0;
    for (let z = 0; z < 2; z++) {
      const wz = z ? fz : 1 - fz;
      for (let y = 0; y < 2; y++) {
        const wy = y ? fy : 1 - fy;
        for (let x = 0; x < 2; x++) {
          const weight = (x ? fx : 1 - fx) * wy * wz;
          const index = x0 + x + selectedCell.dimensions.x * (y0 + y + selectedCell.dimensions.y * (z0 + z));
          const offset = index * _probeDataStride;
          for (let component = 0; component < _probeDataStride; component++) {
            out[component] += selectedCell.probeData[offset + component] * weight;
          }
        }
      }
    }
    return 1;
  }
  return 0;
}

function writeL1Vector(out: Vector4, coefficients: Float32Array, channel: number): void {
  out.set(
    coefficients[channel] * 0.886227,
    coefficients[3 + channel] * -1.023327,
    coefficients[6 + channel] * 1.023327,
    coefficients[9 + channel] * -1.023327
  );
}

function getOrCreateVector4(shaderData: ShaderData, property: ShaderProperty): Vector4 {
  let value = shaderData.getVector4(property);
  if (!value) {
    value = new Vector4();
    shaderData.setVector4(property, value);
  }
  return value;
}

function writeL1Channel(out: Uint16Array, offset: number, coefficients: Float32Array, channel: number): void {
  out[offset] = toHalf(coefficients[channel] * 0.886227);
  out[offset + 1] = toHalf(coefficients[3 + channel] * -1.023327);
  out[offset + 2] = toHalf(coefficients[6 + channel] * 1.023327);
  out[offset + 3] = toHalf(coefficients[9 + channel] * -1.023327);
}

function toVector3(value: Vector3 | number[] | { x: number; y: number; z: number }): Vector3 {
  if (value instanceof Vector3) {
    return value.clone();
  }
  return Array.isArray(value) ? new Vector3(value[0], value[1], value[2]) : new Vector3(value.x, value.y, value.z);
}

function parseBrickJSON(brick: ProbeBrickDataJSON): ProbeBrickData {
  return {
    position: toVector3(brick.position),
    subdivisionLevel: brick.subdivisionLevel,
    sphericalHarmonics: brick.sphericalHarmonics.map(toSphericalHarmonics3),
    visibility: brick.visibility?.map((distances) => new Float32Array(distances)),
    validity: brick.validity ? new Float32Array(brick.validity) : undefined,
    skyOcclusionSH: brick.skyOcclusionSH ? new Float32Array(brick.skyOcclusionSH) : undefined
  };
}

function toSphericalHarmonics3(value: SphericalHarmonics3 | number[]): SphericalHarmonics3 {
  if (value instanceof SphericalHarmonics3) {
    return value.clone();
  }
  if (value.length !== 27) {
    throw new Error("ProbeVolume spherical harmonics must contain exactly 27 coefficients.");
  }
  const sh = new SphericalHarmonics3();
  sh.copyFromArray(value);
  return sh;
}

function toMatrix(value?: Matrix | number[]): Matrix {
  if (!value) {
    return new Matrix();
  }
  if (value instanceof Matrix) {
    return value.clone();
  }
  if (value.length !== 16) {
    throw new Error("ProbeVolume localToWorldMatrix must contain exactly 16 elements.");
  }
  return new Matrix().copyFromArray(value);
}

function toHalf(value: number): number {
  _halfF32[0] = value;
  const x = _halfI32[0];
  let bits = (x >> 16) & 0x8000;
  let mantissa = (x >> 12) & 0x07ff;
  const exponent = (x >> 23) & 0xff;
  if (exponent < 103) return bits;
  if (exponent > 142) {
    bits |= 0x7c00;
    bits |= (exponent === 255 ? 0 : 1) && x & 0x007fffff;
    return bits;
  }
  if (exponent < 113) {
    mantissa |= 0x0800;
    bits |= (mantissa >> (114 - exponent)) + ((mantissa >> (113 - exponent)) & 1);
    return bits;
  }
  bits |= ((exponent - 112) << 10) | (mantissa >> 1);
  bits += mantissa & 1;
  return bits;
}

function isGridAligned(value: number): boolean {
  return Math.abs(value - Math.round(value)) < 1e-4;
}
