import {
  AssetType,
  type Engine,
  Material,
  Shader,
  ShaderFactory,
  Texture2D,
  TextureFilterMode,
  TextureFormat,
  TextureWrapMode,
  Vector2,
  Vector3
} from "@galacean/engine";
import type {
  TerrainAlphamapAtlasPatch,
  TerrainClipmapRenderBinding,
  TerrainHeightAtlasPatch
} from "@galacean/engine-terrain/terrain/clipmap/TerrainClipmapMaterial";
import promptNoiseHeightSource from "../shaders/PromptNoiseHeight.glsl?raw";
import promptNoiseTerrainShaderSource from "../shaders/PromptNoiseTerrain.shader?raw";
import terrainLightingSource from "@galacean/engine-terrain/shaders/shared/Lighting.glsl?raw";
import terrainShadowSource from "@galacean/engine-terrain/shaders/shared/Shadow.glsl?raw";
import { hashPromptNoise } from "@galacean/engine-world-planning/generation/noise/PromptNoiseHash";
import {
  DEFAULT_PROMPT_NOISE_WORLD_RECIPE,
  encodePromptNoiseActiveOperatorTexels,
  promptNoiseFbmSeedOffset,
  type PromptNoiseOperatorBoundsV1,
  type PromptNoiseRiverOperatorV1,
  type PromptNoiseTerrainOperatorV1,
  PromptNoiseTerrainProgram
} from "@galacean/engine-world-planning/generation/noise/PromptNoiseTerrainProgram";
import {
  EMPTY_PROMPT_NOISE_RIVER_FIELD_METRICS,
  measurePromptNoiseRiverFieldSet,
  packPromptNoiseRiverFieldSet,
  PromptNoiseRiverFieldCompiler,
  type PromptNoiseRiverFieldSetMetricsV1
} from "@galacean/engine-world-planning/generation/noise/PromptNoiseRiverFieldCompiler";

const PROMPT_NOISE_SHADER_NAME = "Terrain/PromptNoiseInfinite";

const ASSET_URLS = Object.freeze({
  rockAlbedoHeight: new URL("../assets/world-pcg/rock_albedo_height.png", import.meta.url).href,
  rockNormalRoughness: new URL("../assets/world-pcg/rock_normal_roughness.png", import.meta.url).href,
  grassAlbedoHeight: new URL("../assets/world-pcg/grass_albedo_height.png", import.meta.url).href,
  grassNormalRoughness: new URL("../assets/world-pcg/grass_normal_roughness.png", import.meta.url).href,
  macroNoise: new URL("../assets/world-pcg/macro_variation_noise.png", import.meta.url).href
});

/** Shader feature switches retained from the recovered World PCG material. */
export type PromptNoiseTerrainFeature = "projection" | "dualScaling" | "autoShader" | "macroVariation" | "detiling";

/** Pure analytic terrain Material consumed by the shared Geometry Clipmap topology. */
export class PromptNoiseTerrainBinding implements TerrainClipmapRenderBinding {
  readonly activeRegionCount = 0;
  readonly heightAtlasSize = [0, 0] as const;
  readonly holesAtlasSize = [0, 0] as const;
  readonly activeLayerCount = 2;
  readonly activeAlphamapCount = 0;
  readonly gridOrigin = [0, 0] as const;
  readonly material: Material;

  private readonly _engine: Engine;
  private readonly _viewPosition = new Vector3();
  private _terrainProgram = new PromptNoiseTerrainProgram(DEFAULT_PROMPT_NOISE_WORLD_RECIPE);
  private _operatorTexture: Texture2D;
  private _riverSegmentTexture: Texture2D;
  private _riverCellTexture: Texture2D;
  private _activeOperatorCount = 0;
  private _activeOperatorBytes = 0;
  private _riverFieldMetrics = EMPTY_PROMPT_NOISE_RIVER_FIELD_METRICS;
  private _riverFieldUploadCount = 0;
  private _destroyed = false;

  private constructor(engine: Engine, material: Material) {
    this._engine = engine;
    this.material = material;
    this._operatorTexture = createOperatorTexture(engine, new Float32Array(4));
    this._riverSegmentTexture = createDataTexture(engine, new Float32Array(4), "Prompt-noise River Field segments");
    this._riverCellTexture = createDataTexture(engine, new Float32Array(4), "Prompt-noise River Field cells");
    this.material.shaderData.setTexture("material_OperatorTexels", this._operatorTexture);
    this.material.shaderData.setTexture("material_RiverSegmentTexels", this._riverSegmentTexture);
    this.material.shaderData.setTexture("material_RiverCellTexels", this._riverCellTexture);
    this.setLogicalOrigin(0, 0);
    this.setDebugView(0);
    this.setSelectedOperatorId(0);
    this.setTerrainProgram(this._terrainProgram);
  }

  /**
   * Creates the pure-noise two-layer material from the recovered World PCG assets.
   * @param engine Engine owning the Material and resource-managed textures.
   * @returns Fully initialized analytic Clipmap binding.
   */
  static async create(engine: Engine): Promise<PromptNoiseTerrainBinding> {
    registerInclude("PromptNoiseWorld/Height.glsl", promptNoiseHeightSource);
    registerInclude("shared/Shadow.glsl", terrainShadowSource);
    registerInclude("shared/Lighting.glsl", terrainLightingSource);
    const shader = Shader.find(PROMPT_NOISE_SHADER_NAME) ?? Shader.create(promptNoiseTerrainShaderSource);
    const material = new Material(engine, shader);
    material.name = "World PCG Pure Noise Terrain";

    const [rockAlbedoHeight, rockNormalRoughness, grassAlbedoHeight, grassNormalRoughness, macroNoise] =
      await Promise.all([
        loadTexture(engine, ASSET_URLS.rockAlbedoHeight, true),
        loadTexture(engine, ASSET_URLS.rockNormalRoughness, false),
        loadTexture(engine, ASSET_URLS.grassAlbedoHeight, true),
        loadTexture(engine, ASSET_URLS.grassNormalRoughness, false),
        loadTexture(engine, ASSET_URLS.macroNoise, false)
      ]);

    material.shaderData.setTexture("material_RockAlbedoHeight", rockAlbedoHeight);
    material.shaderData.setTexture("material_RockNormalRoughness", rockNormalRoughness);
    material.shaderData.setTexture("material_GrassAlbedoHeight", grassAlbedoHeight);
    material.shaderData.setTexture("material_GrassNormalRoughness", grassNormalRoughness);
    material.shaderData.setTexture("material_MacroNoise", macroNoise);

    material.shaderData.setFloat("material_TerrainVertexSpacing", 1);
    material.shaderData.setFloat("material_WorldNoiseScale", 9.85);
    material.shaderData.setFloat("material_WorldNoiseHeight", 34);
    material.shaderData.setVector3("material_WorldNoiseOffset", new Vector3(2.17, -1.225, 1.9));

    material.shaderData.setVector3("material_GrassColor", new Vector3(0.67451, 0.74902, 0.686275));
    material.shaderData.setFloat("material_RockUvScale", 0.1);
    material.shaderData.setFloat("material_GrassUvScale", 0.2);
    material.shaderData.setFloat("material_GrassDetilingRotation", 0.161);
    material.shaderData.setFloat("material_ProjectionThreshold", 0.87);
    material.shaderData.setFloat("material_AutoSlope", 0.45);
    material.shaderData.setFloat("material_AutoHeightReduction", 0.05);
    material.shaderData.setFloat("material_DualNear", 100);
    material.shaderData.setFloat("material_DualFar", 170);
    material.shaderData.setFloat("material_DualReduction", 0.3);
    material.shaderData.setFloat("material_TriReduction", 0.3);
    material.shaderData.setFloat("material_NormalDetailNear", 160);
    material.shaderData.setFloat("material_NormalDetailFar", 520);
    material.shaderData.setVector3("material_MacroColor1", new Vector3(0.855, 0.8625, 0.9));
    material.shaderData.setVector3("material_MacroColor2", new Vector3(0.9, 0.885, 0.81));
    material.shaderData.setFloat("material_MacroSlope", 0.333);
    material.shaderData.setFloat("material_Noise1Scale", 0.04);
    material.shaderData.setFloat("material_Noise1Angle", 0.1);
    material.shaderData.setVector2("material_Noise1Offset", new Vector2(0.5, 0.5));
    material.shaderData.setFloat("material_Noise2Scale", 0.076);
    material.shaderData.setVector3("material_RiverbedColor", new Vector3(0.255, 0.225, 0.18));
    material.shaderData.setFloat("material_RiverbedBlend", 0.76);
    material.shaderData.setFloat("material_WetEdgeDarkening", 0.24);
    material.shaderData.setFloat("material_WetEdgeRoughness", 0.32);
    material.shaderData.setFloat("material_ErosionGrassSuppression", 0.56);

    const binding = new PromptNoiseTerrainBinding(engine, material);
    for (const feature of ["projection", "dualScaling", "autoShader", "macroVariation", "detiling"] as const) {
      binding.setFeatureEnabled(feature, true);
    }
    return binding;
  }

  /**
   * Sets the logical world origin added to renderer-local Clipmap coordinates.
   * @param x Logical X in metres.
   * @param z Logical Z in metres.
   * @returns Nothing.
   */
  setLogicalOrigin(x: number, z: number): void {
    this._assertAlive();
    this.material.shaderData.setVector2("material_WorldOrigin", new Vector2(x, z));
  }

  /**
   * Binds the main view position used by identical forward and shadow Clipmap morphing.
   * @param x Main camera local X position in metres.
   * @param y Main camera local Y position in metres.
   * @param z Main camera local Z position in metres.
   * @returns Nothing.
   */
  setViewPosition(x: number, y: number, z: number): void {
    this._assertAlive();
    this._viewPosition.set(x, y, z);
    this.material.shaderData.setVector3("material_TerrainViewPosition", this._viewPosition);
  }

  /**
   * Enables or disables one recovered material feature for visual A/B inspection.
   * @param feature Named shader feature.
   * @param enabled Whether the feature participates in rendering.
   * @returns Nothing.
   */
  setFeatureEnabled(feature: PromptNoiseTerrainFeature, enabled: boolean): void {
    this._assertAlive();
    const property = {
      projection: "material_ProjectionEnabled",
      dualScaling: "material_DualScalingEnabled",
      autoShader: "material_AutoShaderEnabled",
      macroVariation: "material_MacroVariationEnabled",
      detiling: "material_DetilingEnabled"
    }[feature];
    this.material.shaderData.setInt(property, enabled ? 1 : 0);
  }

  /**
   * Switches the production or diagnostic shader output.
   * @param debugView Numeric view shared by the Gallery controls and diagnostics.
   * @returns Nothing.
   */
  setDebugView(debugView: number): void {
    this._assertAlive();
    this.material.shaderData.setInt("material_DebugView", debugView);
  }

  /**
   * Replaces the analytic program and uploads only operators intersecting optional active bounds.
   * @param program Seeded base field and ordered local operators.
   * @param activeBounds Optional logical Clipmap coverage used for compact-support selection.
   * @returns Nothing after the active RGBA32F operator table is bound.
   */
  setTerrainProgram(program: PromptNoiseTerrainProgram, activeBounds?: PromptNoiseOperatorBoundsV1): void {
    this._assertAlive();
    this._terrainProgram = program;
    const base = program.recipe.base;
    const ridgeSeed = hashPromptNoise(base.rootSeed, 0x5249_4447);
    const fbmSeedOffset = promptNoiseFbmSeedOffset(base.rootSeed);
    this.material.shaderData.setInt("material_RidgeSeed", ridgeSeed | 0);
    this.material.shaderData.setVector2("material_FbmSeedOffset", new Vector2(...fbmSeedOffset));
    this.material.shaderData.setFloat("material_WorldNoiseScale", base.worldNoiseScale);
    this.material.shaderData.setFloat("material_WorldNoiseHeight", base.worldNoiseHeight);
    this.material.shaderData.setVector3("material_WorldNoiseOffset", new Vector3(...base.worldNoiseOffset));
    this.material.shaderData.setFloat("material_RidgeStrength", base.ridgeStrength);
    this.material.shaderData.setFloat("material_RidgeFrequency", base.ridgeFrequency);
    this.material.shaderData.setFloat("material_RidgeSharpness", base.ridgeSharpness);
    const activeOperators = activeBounds ? program.selectActiveOperators(activeBounds) : program.recipe.operators;
    this._uploadOperators(activeOperators);
  }

  /**
   * Selects one operator for the formula-mask highlight.
   * @param operatorId Stable exact id, or zero for no highlight.
   * @returns Nothing.
   */
  setSelectedOperatorId(operatorId: number): void {
    this._assertAlive();
    this.material.shaderData.setInt("material_SelectedOperatorId", operatorId | 0);
  }

  /** @returns Current immutable program and active GPU table measurements. */
  getTerrainProgram(): {
    readonly program: PromptNoiseTerrainProgram;
    readonly activeOperatorCount: number;
    readonly activeOperatorBytes: number;
    readonly riverFieldMetrics: PromptNoiseRiverFieldSetMetricsV1;
    readonly riverFieldUploadCount: number;
    readonly destroyed: boolean;
  } {
    return Object.freeze({
      program: this._terrainProgram,
      activeOperatorCount: this._activeOperatorCount,
      activeOperatorBytes: this._activeOperatorBytes,
      riverFieldMetrics: this._riverFieldMetrics,
      riverFieldUploadCount: this._riverFieldUploadCount,
      destroyed: this._destroyed
    });
  }

  /** @throws Pure-noise terrain has no Heightmap residency to patch. */
  updateHeightRegion(_patch: TerrainHeightAtlasPatch): void {
    throw new Error("Pure-noise terrain has no Heightmap residency to patch");
  }

  /** @throws Pure-noise terrain has no Alphamap residency to patch. */
  updateAlphamapRegion(_patch: TerrainAlphamapAtlasPatch): void {
    throw new Error("Pure-noise terrain has no Alphamap residency to patch");
  }

  /** Releases the analytic Material; loaded textures remain resource-manager owned. */
  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    try {
      this._operatorTexture.destroy();
      this._riverSegmentTexture.destroy();
      this._riverCellTexture.destroy();
    } finally {
      this.material.destroy();
    }
    this._activeOperatorCount = 0;
    this._activeOperatorBytes = 0;
    this._riverFieldMetrics = EMPTY_PROMPT_NOISE_RIVER_FIELD_METRICS;
  }

  private _assertAlive(): void {
    if (this._destroyed) throw new Error("PromptNoiseTerrainBinding has been destroyed");
  }

  private _uploadOperators(operators: readonly PromptNoiseTerrainOperatorV1[]): void {
    const records = encodePromptNoiseActiveOperatorTexels(
      operators,
      this._terrainProgram.recipe.templateRegistryVersion
    );
    const fields = operators
      .filter(
        (operator): operator is PromptNoiseRiverOperatorV1 =>
          operator.kind === "river" && operator.controlPoints !== undefined
      )
      .map((operator) => PromptNoiseRiverFieldCompiler.compile(operator));
    const packedFields = packPromptNoiseRiverFieldSet(fields);
    this._riverFieldMetrics = measurePromptNoiseRiverFieldSet(fields, packedFields);
    this._riverFieldUploadCount++;
    const bindingByOperatorId = new Map(packedFields.bindings.map((binding) => [binding.operatorId, binding]));
    operators.forEach((operator, index) => {
      const binding = bindingByOperatorId.get(operator.id);
      if (!binding) return;
      const offset = index * 7 * 4;
      records.set([binding.segmentOffset, binding.segmentCount, binding.cellOffset, 1], offset + 16);
      records.set([binding.originX, binding.originZ, binding.cellSizeX, binding.cellSizeZ], offset + 20);
      records.set([binding.gridWidth, binding.gridHeight, 0, 1], offset + 24);
    });
    const replacement = createOperatorTexture(this._engine, records.length > 0 ? records : new Float32Array(4));
    const segmentReplacement = createDataTexture(
      this._engine,
      packedFields.segmentTexels.length > 0 ? packedFields.segmentTexels : new Float32Array(4),
      "Prompt-noise River Field segments"
    );
    const cellReplacement = createDataTexture(
      this._engine,
      packedFields.cellTexels.length > 0 ? packedFields.cellTexels : new Float32Array(4),
      "Prompt-noise River Field cells"
    );
    this.material.shaderData.setTexture("material_OperatorTexels", replacement);
    this.material.shaderData.setTexture("material_RiverSegmentTexels", segmentReplacement);
    this.material.shaderData.setTexture("material_RiverCellTexels", cellReplacement);
    const previous = this._operatorTexture;
    const previousSegments = this._riverSegmentTexture;
    const previousCells = this._riverCellTexture;
    this._operatorTexture = replacement;
    this._riverSegmentTexture = segmentReplacement;
    this._riverCellTexture = cellReplacement;
    previous.destroy();
    previousSegments.destroy();
    previousCells.destroy();
    this._activeOperatorCount = operators.length;
    this._activeOperatorBytes =
      records.byteLength + packedFields.segmentTexels.byteLength + packedFields.cellTexels.byteLength;
    this.material.shaderData.setInt("material_OperatorCount", operators.length);
  }
}

function registerInclude(name: string, source: string): void {
  if (!ShaderFactory.includeMap[name]) ShaderFactory.registerInclude(name, source);
}

async function loadTexture(engine: Engine, url: string, isSRGBColorSpace: boolean): Promise<Texture2D> {
  const texture = await engine.resourceManager.load<Texture2D>({
    type: AssetType.Texture,
    url,
    params: {
      isSRGBColorSpace,
      mipmap: true,
      wrapModeU: TextureWrapMode.Repeat,
      wrapModeV: TextureWrapMode.Repeat,
      filterMode: TextureFilterMode.Trilinear,
      anisoLevel: 16
    }
  });
  if (!(texture instanceof Texture2D)) throw new Error(`Terrain texture did not resolve to Texture2D: ${url}`);
  return texture;
}

function createOperatorTexture(engine: Engine, records: Float32Array): Texture2D {
  return createDataTexture(engine, records, "Prompt-noise active operator texels");
}

function createDataTexture(engine: Engine, records: Float32Array, name: string): Texture2D {
  const texelCount = records.length / 4;
  const width = Math.min(256, Math.max(1, texelCount));
  const height = Math.max(1, Math.ceil(texelCount / width));
  const pixels = new Float32Array(width * height * 4);
  pixels.set(records);
  const texture = new Texture2D(engine, width, height, TextureFormat.R32G32B32A32, false);
  texture.name = name;
  texture.filterMode = TextureFilterMode.Point;
  texture.wrapModeU = TextureWrapMode.Clamp;
  texture.wrapModeV = TextureWrapMode.Clamp;
  texture.setPixelBuffer(pixels);
  return texture;
}
