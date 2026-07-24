import {
  BaseMaterial,
  Engine,
  Shader,
  ShaderMacro,
  ShaderProperty,
  Texture2D,
  Texture2DArray,
  Vector2,
  Vector3,
  Vector4
} from "@galacean/engine";
import { TerrainData } from "./data/TerrainData";
import { TerrainLayerSpec, TerrainMaterialSpec, TerrainWorldNoiseSpec } from "./loader/ManifestLoader";

/** Production shader outputs that isolate terrain's data and sampling stages. */
export enum TerrainDebugView {
  Surface = 0,
  Height = 1,
  Region = 2,
  ControlBase = 3,
  ControlOverlay = 4,
  ControlBlend = 5,
  ControlAngle = 6,
  ControlScale = 7,
  AutoShader = 8,
  Holes = 9,
  RegionGrid = 10,
  VertexGrid = 11,
  TerrainNormal = 12,
  ClipmapLod = 13,
  DualFactor = 14,
  Checkerboard = 15,
  Grey = 16,
  Jaggedness = 17,
  ControlTexture = 18,
  TextureHeight = 19,
  TextureNormal = 20,
  TextureRoughness = 21,
  DetileCell = 22,
  SamplingMip = 23,
  LayerSource = 24,
  LayerDetiled = 25,
  Bilerp = 26,
  Wireframe = 27,
  ColorMap = 28,
  RoughMap = 29,
  DetileRotationAxis = 30
}

/** Mutable per-layer inputs exposed to the terrain diagnostics surface. */
export interface TerrainLayerTuning {
  /** terrain texture UV scale in terrain metres. */
  uvScale?: number;
  /** terrain detile rotation amount in turns. */
  detilingRotation?: number;
  /** terrain detile translation amount in turns. */
  detilingShift?: number;
  /** Tangent-space normal-map depth multiplier. */
  normalDepth?: number;
  /** Height-alpha ambient-occlusion multiplier. */
  aoStrength?: number;
  /** Offset applied to sampled normal-map roughness alpha. */
  roughnessMod?: number;
}

/** Mutable sampling inputs exposed to the terrain diagnostics surface. */
export interface TerrainSamplingTuning {
  /** terrain height-aware material blend sharpness. */
  blendSharpness?: number;
  /** Derivative multiplier used before textureGrad. */
  mipmapBias?: number;
  /** Distance at which the derivative bias begins changing. */
  biasDistance?: number;
  /** Far-distance derivative contribution. */
  depthBlur?: number;
}

/** Mutable terrain auto-shader parameters exposed by the production inspector. */
export interface TerrainAutoShaderTuning {
  /** Whether the automatic-material block is compiled for this material. */
  enabled?: boolean;
  /** Texture-asset ID used for the generated base control. */
  baseTexture?: number;
  /** Texture-asset ID used for the generated overlay control. */
  overlayTexture?: number;
  /** Slope threshold. */
  slope?: number;
  /** Height contribution to the automatic-material threshold. */
  heightReduction?: number;
}

/** Mutable terrain projection parameters exposed by the production inspector. */
export interface TerrainProjectionTuning {
  /** Whether steep terrain uses terrain's projected sampling coordinates. */
  enabled?: boolean;
  /** Minimum up-normal component before projected sampling is used. */
  threshold?: number;
}

/** Mutable terrain dual-scaling parameters exposed by the production inspector. */
export interface TerrainDualScalingTuning {
  /** Whether dual scaling is compiled for this material. */
  enabled?: boolean;
  /** Texture-asset ID sampled at the reduced far scale. */
  texture?: number;
  /** Reduced texture scale used after the near/far transition. */
  reduction?: number;
  /** Camera distance at which the far-scale blend starts. */
  near?: number;
  /** Camera distance at which the far-scale blend completes. */
  far?: number;
}

/** Mutable terrain macro-variation parameters exposed by the production inspector. */
export interface TerrainMacroVariationTuning {
  /** Whether the macro-variation block is compiled for this material. */
  enabled?: boolean;
  /** First macro tint. */
  color1?: readonly [r: number, g: number, b: number];
  /** Second macro tint. */
  color2?: readonly [r: number, g: number, b: number];
  /** Normal-slope contribution. */
  slope?: number;
  /** First noise lookup scale. */
  noise1Scale?: number;
  /** First noise lookup rotation in radians. */
  noise1Angle?: number;
  /** First noise lookup offset. */
  noise1Offset?: readonly [x: number, y: number];
  /** Second noise lookup scale. */
  noise2Scale?: number;
}

/** Mutable values for procedural world continuation. */
export interface TerrainWorldNoiseTuning {
  /** Uses fragment height lookups rather than vertex-propagated world-noise derivatives. */
  fragmentNormals?: boolean;
  /** Authored-region to procedural-noise transition width. */
  regionBlend?: number;
  /** Highest morenoise octave count near the camera. */
  maxOctaves?: number;
  /** Lowest morenoise octave count at long distance. */
  minOctaves?: number;
  /** Distance over which the octave count reaches the minimum. */
  lodDistance?: number;
  /** Procedural world-noise frequency multiplier. */
  scale?: number;
  /** Procedural world-noise height multiplier. */
  height?: number;
  /** Procedural world-noise XZ translation and Y height offset. */
  offset?: readonly [x: number, y: number, z: number];
}

/** Runtime terrain material groups that are safe to alter without replacing core data resources. */
export interface TerrainMaterialTuning {
  /** Auto-shader settings. */
  autoShader?: TerrainAutoShaderTuning;
  /** Steep-slope projection settings. */
  projection?: TerrainProjectionTuning;
  /** Distance-based dual-scaling settings. */
  dualScaling?: TerrainDualScalingTuning;
  /** Macro-noise color variation settings. */
  macroVariation?: TerrainMacroVariationTuning;
}

/** Shared material containing terrain region maps, texture assets, and sampling parameters. */
export class TerrainMaterial extends BaseMaterial {
  private static readonly _autoMacro = ShaderMacro.getByName("TERRAIN_AUTO_SHADER");
  private static readonly _dualMacro = ShaderMacro.getByName("TERRAIN_DUAL_SCALING");
  private static readonly _macroVariationMacro = ShaderMacro.getByName("TERRAIN_MACRO_VARIATION");
  private static readonly _directLightingMacro = ShaderMacro.getByName("TERRAIN_DIRECT_LIGHTING");
  private static readonly _indirectLightingMacro = ShaderMacro.getByName("TERRAIN_INDIRECT_LIGHTING");
  private static readonly _debugMacro = ShaderMacro.getByName("TERRAIN_DEBUG");

  private static readonly _heightMaps = ShaderProperty.getByName("material_HeightMaps");
  private static readonly _controlMaps = ShaderProperty.getByName("material_ControlMaps");
  private static readonly _colorMaps = ShaderProperty.getByName("material_ColorMaps");
  private static readonly _regionMap = ShaderProperty.getByName("material_RegionMap");
  private static readonly _terrainParams = ShaderProperty.getByName("material_TerrainParams");
  private static readonly _regionMapSize = ShaderProperty.getByName("material_RegionMapSize");
  private static readonly _meshSize = ShaderProperty.getByName("material_MeshSize");
  private static readonly _backgroundMode = ShaderProperty.getByName("material_BackgroundMode");
  private static readonly _worldNoiseFragmentNormals = ShaderProperty.getByName("material_WorldNoiseFragmentNormals");
  private static readonly _worldNoiseRegionBlend = ShaderProperty.getByName("material_WorldNoiseRegionBlend");
  private static readonly _worldNoiseMaxOctaves = ShaderProperty.getByName("material_WorldNoiseMaxOctaves");
  private static readonly _worldNoiseMinOctaves = ShaderProperty.getByName("material_WorldNoiseMinOctaves");
  private static readonly _worldNoiseLodDistance = ShaderProperty.getByName("material_WorldNoiseLodDistance");
  private static readonly _worldNoiseScale = ShaderProperty.getByName("material_WorldNoiseScale");
  private static readonly _worldNoiseHeight = ShaderProperty.getByName("material_WorldNoiseHeight");
  private static readonly _worldNoiseOffset = ShaderProperty.getByName("material_WorldNoiseOffset");

  private static readonly _albedoArray = ShaderProperty.getByName("material_LayerAlbedoArray");
  private static readonly _normalArray = ShaderProperty.getByName("material_LayerNormalArray");
  private static readonly _layerCount = ShaderProperty.getByName("material_LayerCount");
  private static readonly _uvScales = ShaderProperty.getByName("material_LayerUvScales");
  private static readonly _detiling = ShaderProperty.getByName("material_LayerDetiling");
  private static readonly _colors = ShaderProperty.getByName("material_LayerColors");
  private static readonly _normalDepths = ShaderProperty.getByName("material_LayerNormalDepths");
  private static readonly _aoStrengths = ShaderProperty.getByName("material_LayerAoStrengths");
  private static readonly _roughnessMods = ShaderProperty.getByName("material_LayerRoughnessMods");

  private static readonly _autoSlope = ShaderProperty.getByName("material_AutoSlope");
  private static readonly _autoHeightReduction = ShaderProperty.getByName("material_AutoHeightReduction");
  private static readonly _autoBase = ShaderProperty.getByName("material_AutoBaseTexture");
  private static readonly _autoOverlay = ShaderProperty.getByName("material_AutoOverlayTexture");

  private static readonly _projectionEnabled = ShaderProperty.getByName("material_ProjectionEnabled");
  private static readonly _projectionThreshold = ShaderProperty.getByName("material_ProjectionThreshold");
  private static readonly _blendSharpness = ShaderProperty.getByName("material_BlendSharpness");
  private static readonly _mipmapBias = ShaderProperty.getByName("material_MipmapBias");
  private static readonly _biasDistance = ShaderProperty.getByName("material_BiasDistance");
  private static readonly _depthBlur = ShaderProperty.getByName("material_DepthBlur");

  private static readonly _dualTexture = ShaderProperty.getByName("material_DualTexture");
  private static readonly _dualReduction = ShaderProperty.getByName("material_DualReduction");
  private static readonly _dualNear = ShaderProperty.getByName("material_DualNear");
  private static readonly _dualFar = ShaderProperty.getByName("material_DualFar");

  private static readonly _macroNoise = ShaderProperty.getByName("material_MacroNoise");
  private static readonly _macroColor1 = ShaderProperty.getByName("material_MacroColor1");
  private static readonly _macroColor2 = ShaderProperty.getByName("material_MacroColor2");
  private static readonly _macroSlope = ShaderProperty.getByName("material_MacroSlope");
  private static readonly _noise1Scale = ShaderProperty.getByName("material_Noise1Scale");
  private static readonly _noise1Angle = ShaderProperty.getByName("material_Noise1Angle");
  private static readonly _noise1Offset = ShaderProperty.getByName("material_Noise1Offset");
  private static readonly _noise2Scale = ShaderProperty.getByName("material_Noise2Scale");
  private static readonly _debugView = ShaderProperty.getByName("material_DebugView");
  private static readonly _debugLayer = ShaderProperty.getByName("material_DebugLayer");

  private readonly _uvScaleValues = new Float32Array(32);
  private readonly _detilingValues = new Float32Array(32 * 2);
  private readonly _colorValues = new Float32Array(32 * 3);
  private readonly _normalDepthValues = new Float32Array(32);
  private readonly _aoStrengthValues = new Float32Array(32);
  private readonly _roughnessModValues = new Float32Array(32);
  private _layerCountValue = 0;
  private _dualNearValue = 0;
  private _dualFarValue = 1;
  private _worldNoiseMaxOctavesValue = 4;
  private _worldNoiseMinOctavesValue = 2;

  /**
   * Creates the material after the Terrain shader has been registered.
   * @param engine Engine that owns the material.
   * @throws If the Terrain shader has not been registered.
   */
  constructor(engine: Engine) {
    const shader = Shader.find("Terrain");
    if (!shader) throw new Error('[TerrainMaterial] Shader "Terrain" is not registered');
    super(engine, shader);

    this._uvScaleValues.fill(0.1);
    this._normalDepthValues.fill(1);
    this._aoStrengthValues.fill(1);
    for (let index = 0; index < 32; index++) {
      this._colorValues[index * 3] = 1;
      this._colorValues[index * 3 + 1] = 1;
      this._colorValues[index * 3 + 2] = 1;
    }
    this._uploadLayerParameters();
    this.shaderData.setInt(TerrainMaterial._layerCount, 0);
    this.shaderData.setInt(TerrainMaterial._backgroundMode, 0);
    this._setMacro(TerrainMaterial._directLightingMacro, true);
    this._setMacro(TerrainMaterial._indirectLightingMacro, true);
    this.setDebugView(TerrainDebugView.Surface);
    this.shaderData.setInt(TerrainMaterial._debugLayer, 0);
  }

  /**
   * Binds the shared terrain data resources and dimensional invariants.
   * @param data Loaded terrain region data.
   * @param meshSize Clipmap tile size in quads used by vertex geomorphing.
   */
  bindTerrain(data: TerrainData, meshSize: number): void {
    this.shaderData.setTexture(TerrainMaterial._heightMaps, data.heightMaps);
    this.shaderData.setTexture(TerrainMaterial._controlMaps, data.controlMaps);
    this.shaderData.setTexture(TerrainMaterial._colorMaps, data.colorMaps);
    this.shaderData.setTexture(TerrainMaterial._regionMap, data.regionMap);
    this.shaderData.setVector4(
      TerrainMaterial._terrainParams,
      new Vector4(data.regionSize, 1 / data.regionSize, data.vertexSpacing, 1 / data.vertexSpacing)
    );
    this.shaderData.setInt(TerrainMaterial._regionMapSize, data.regionMapSize);
    this.shaderData.setFloat(TerrainMaterial._meshSize, meshSize);
  }

  /**
   * Sets terrain's world background behavior outside loaded regions.
   * @param mode Zero for `None`, one for `Flat`, and two for `Noise`.
   */
  setBackgroundMode(mode: 0 | 1 | 2): void {
    this.shaderData.setInt(TerrainMaterial._backgroundMode, mode);
  }

  /**
   * Configures procedural continuation outside loaded regions.
   * @param spec World-noise settings from the terrain manifest.
   */
  configureWorldNoise(spec: TerrainWorldNoiseSpec): void {
    this.setWorldNoiseTuning(spec);
  }

  /**
   * Updates terrain's procedural world-noise inputs.
   * @param tuning Values to replace; omitted values retain their current world-noise state.
   * @throws If an input is outside terrain's declared editor range or min octaves exceeds max octaves.
   */
  setWorldNoiseTuning(tuning: TerrainWorldNoiseTuning): void {
    const minOctaves =
      tuning.minOctaves === undefined
        ? this._worldNoiseMinOctavesValue
        : this._integerRange("worldNoise.minOctaves", tuning.minOctaves, 0, 15);
    const maxOctaves =
      tuning.maxOctaves === undefined
        ? this._worldNoiseMaxOctavesValue
        : this._integerRange("worldNoise.maxOctaves", tuning.maxOctaves, 0, 15);
    if (minOctaves > maxOctaves) {
      throw new Error("[TerrainMaterial] worldNoise.minOctaves must not exceed maxOctaves");
    }
    if (tuning.fragmentNormals !== undefined) {
      this.shaderData.setInt(TerrainMaterial._worldNoiseFragmentNormals, tuning.fragmentNormals ? 1 : 0);
    }
    if (tuning.regionBlend !== undefined) {
      this.shaderData.setFloat(
        TerrainMaterial._worldNoiseRegionBlend,
        this._range("worldNoise.regionBlend", tuning.regionBlend, 0.05, 0.95)
      );
    }
    if (tuning.maxOctaves !== undefined) {
      this.shaderData.setInt(TerrainMaterial._worldNoiseMaxOctaves, maxOctaves);
      this._worldNoiseMaxOctavesValue = maxOctaves;
    }
    if (tuning.minOctaves !== undefined) {
      this.shaderData.setInt(TerrainMaterial._worldNoiseMinOctaves, minOctaves);
      this._worldNoiseMinOctavesValue = minOctaves;
    }
    if (tuning.lodDistance !== undefined) {
      this.shaderData.setFloat(TerrainMaterial._worldNoiseLodDistance, this._range("worldNoise.lodDistance", tuning.lodDistance, 0, 40000));
    }
    if (tuning.scale !== undefined) {
      this.shaderData.setFloat(TerrainMaterial._worldNoiseScale, this._range("worldNoise.scale", tuning.scale, 0.25, 20));
    }
    if (tuning.height !== undefined) {
      this.shaderData.setFloat(TerrainMaterial._worldNoiseHeight, this._range("worldNoise.height", tuning.height, 0, 1000));
    }
    if (tuning.offset !== undefined) {
      const [x, y, z] = tuning.offset;
      this.shaderData.setVector3(
        TerrainMaterial._worldNoiseOffset,
        new Vector3(this._finite("worldNoise.offset.x", x), this._finite("worldNoise.offset.y", y), this._finite("worldNoise.offset.z", z))
      );
    }
  }

  /**
   * Binds the texture arrays and exact terrain texture-asset parameter slots.
   * @param albedoHeight Albedo RGB plus height alpha texture array.
   * @param normalRoughness Normal RGB plus roughness alpha texture array.
   * @param layers Contiguous terrain texture asset descriptors.
   */
  setLayerLibrary(
    albedoHeight: Texture2DArray,
    normalRoughness: Texture2DArray,
    layers: readonly TerrainLayerSpec[]
  ): void {
    this.shaderData.setTexture(TerrainMaterial._albedoArray, albedoHeight);
    this.shaderData.setTexture(TerrainMaterial._normalArray, normalRoughness);
    this.shaderData.setInt(TerrainMaterial._layerCount, layers.length);
    this._layerCountValue = layers.length;
    for (const layer of layers) {
      const index = layer.id;
      this._uvScaleValues[index] = layer.uvScale;
      this._detilingValues[index * 2] = layer.detilingRotation;
      this._detilingValues[index * 2 + 1] = layer.detilingShift;
      this._colorValues[index * 3] = layer.albedoColor[0];
      this._colorValues[index * 3 + 1] = layer.albedoColor[1];
      this._colorValues[index * 3 + 2] = layer.albedoColor[2];
      this._normalDepthValues[index] = layer.normalDepth;
      this._aoStrengthValues[index] = layer.aoStrength;
      this._roughnessModValues[index] = layer.roughnessMod;
    }
    this._uploadLayerParameters();
  }

  /**
   * Applies terrain's shader parameters and compile-time feature switches.
   * @param spec Material parameters from the terrain manifest.
   * @param macroNoise Noise texture referenced by the macro-variation block.
   */
  configure(spec: TerrainMaterialSpec, macroNoise: Texture2D): void {
    const auto = spec.autoShader;
    this.shaderData.setFloat(TerrainMaterial._autoSlope, auto.slope);
    this.shaderData.setFloat(TerrainMaterial._autoHeightReduction, auto.heightReduction);
    this.shaderData.setInt(TerrainMaterial._autoBase, auto.baseTexture);
    this.shaderData.setInt(TerrainMaterial._autoOverlay, auto.overlayTexture);
    this._setMacro(TerrainMaterial._autoMacro, auto.enabled);

    this.shaderData.setInt(TerrainMaterial._projectionEnabled, spec.projection.enabled ? 1 : 0);
    this.shaderData.setFloat(TerrainMaterial._projectionThreshold, spec.projection.threshold);
    this.shaderData.setFloat(TerrainMaterial._blendSharpness, spec.sampling.blendSharpness);
    this.shaderData.setFloat(TerrainMaterial._mipmapBias, spec.sampling.mipmapBias);
    this.shaderData.setFloat(TerrainMaterial._biasDistance, spec.sampling.biasDistance);
    this.shaderData.setFloat(TerrainMaterial._depthBlur, spec.sampling.depthBlur);

    const dual = spec.dualScaling;
    this.shaderData.setInt(TerrainMaterial._dualTexture, dual.texture);
    this.shaderData.setFloat(TerrainMaterial._dualReduction, dual.reduction);
    this.shaderData.setFloat(TerrainMaterial._dualNear, dual.near);
    this.shaderData.setFloat(TerrainMaterial._dualFar, dual.far);
    this._dualNearValue = dual.near;
    this._dualFarValue = dual.far;
    this._setMacro(TerrainMaterial._dualMacro, dual.enabled);

    const macro = spec.macroVariation;
    this.shaderData.setTexture(TerrainMaterial._macroNoise, macroNoise);
    this.shaderData.setVector3(TerrainMaterial._macroColor1, new Vector3(...macro.color1));
    this.shaderData.setVector3(TerrainMaterial._macroColor2, new Vector3(...macro.color2));
    this.shaderData.setFloat(TerrainMaterial._macroSlope, macro.slope);
    this.shaderData.setFloat(TerrainMaterial._noise1Scale, macro.noise1Scale);
    this.shaderData.setFloat(TerrainMaterial._noise1Angle, macro.noise1Angle);
    this.shaderData.setVector2(TerrainMaterial._noise1Offset, new Vector2(...macro.noise1Offset));
    this.shaderData.setFloat(TerrainMaterial._noise2Scale, macro.noise2Scale);
    this._setMacro(TerrainMaterial._macroVariationMacro, macro.enabled);
  }

  /**
   * Selects a production-shader diagnostic output.
   * @param view Named terrain debug view.
   */
  setDebugView(view: TerrainDebugView): void {
    this._setMacro(TerrainMaterial._debugMacro, view !== TerrainDebugView.Surface);
    this.shaderData.setInt(TerrainMaterial._debugView, view);
  }

  /**
   * Enables or removes baked diffuse terrain lighting at shader-variant granularity.
   * @param enabled Whether baked ambient-light sampling is included in the terrain shader.
   */
  setIndirectLightingEnabled(enabled: boolean): void {
    this._setMacro(TerrainMaterial._indirectLightingMacro, enabled);
  }

  /**
   * Enables or removes direct-light and shadow evaluation at shader-variant granularity.
   * @param enabled Whether direct-light evaluation is included in the terrain shader.
   */
  setDirectLightingEnabled(enabled: boolean): void {
    this._setMacro(TerrainMaterial._directLightingMacro, enabled);
  }

  /**
   * Selects the texture-asset slot used by layer-level production shader diagnostics.
   * @param layer Texture-asset slot in the bound terrain layer library.
   * @throws If no layer library is bound or the slot is out of range.
   */
  setDebugLayer(layer: number): void {
    if (!Number.isInteger(layer) || layer < 0 || layer >= this._layerCountValue) {
      throw new Error(`[TerrainMaterial] debug layer ${layer} is outside 0..${this._layerCountValue - 1}`);
    }
    this.shaderData.setInt(TerrainMaterial._debugLayer, layer);
  }

  /**
   * Updates a bounded subset of terrain texture-asset parameters for diagnostics.
   * @param layer Texture-asset slot in the bound terrain layer library.
   * @param tuning Values to replace; omitted fields retain their current values.
   * @throws If the layer is outside the bound texture-asset library or a value is non-finite.
   */
  setLayerTuning(layer: number, tuning: TerrainLayerTuning): void {
    this._assertLayer(layer);
    if (tuning.uvScale !== undefined) this._uvScaleValues[layer] = this._range("uvScale", tuning.uvScale, 0.001, 2);
    if (tuning.detilingRotation !== undefined) {
      this._detilingValues[layer * 2] = this._range("detilingRotation", tuning.detilingRotation, 0, 1);
    }
    if (tuning.detilingShift !== undefined) {
      this._detilingValues[layer * 2 + 1] = this._range("detilingShift", tuning.detilingShift, 0, 1);
    }
    if (tuning.normalDepth !== undefined) this._normalDepthValues[layer] = this._range("normalDepth", tuning.normalDepth, 0, 2);
    if (tuning.aoStrength !== undefined) this._aoStrengthValues[layer] = this._range("aoStrength", tuning.aoStrength, 0, 2);
    if (tuning.roughnessMod !== undefined) this._roughnessModValues[layer] = this._range("roughnessMod", tuning.roughnessMod, -1, 1);
    this._uploadLayerParameters();
  }

  /**
   * Updates the runtime texture-sampling controls used by production terrain diagnostics.
   * @param tuning Values to replace; omitted fields retain their current values.
   * @throws If a numeric value is non-finite.
   */
  setSamplingTuning(tuning: TerrainSamplingTuning): void {
    if (tuning.blendSharpness !== undefined)
      this.shaderData.setFloat(TerrainMaterial._blendSharpness, this._range("blendSharpness", tuning.blendSharpness, 0, 1));
    if (tuning.mipmapBias !== undefined) {
      this.shaderData.setFloat(TerrainMaterial._mipmapBias, this._range("mipmapBias", tuning.mipmapBias, 0.5, 1.5));
    }
    if (tuning.biasDistance !== undefined) {
      this.shaderData.setFloat(TerrainMaterial._biasDistance, this._range("biasDistance", tuning.biasDistance, 0, 16384));
    }
    if (tuning.depthBlur !== undefined) {
      this.shaderData.setFloat(TerrainMaterial._depthBlur, this._range("depthBlur", tuning.depthBlur, 0, 35));
    }
  }

  /**
   * Updates terrain feature groups without rebinding terrain resources.
   * @param tuning Feature values to replace; omitted values retain their current material state.
   * @throws If a numeric value is non-finite, a texture ID is outside the layer library, or dual far is not greater than near.
   */
  setMaterialTuning(tuning: TerrainMaterialTuning): void {
    const auto = tuning.autoShader;
    if (auto) {
      if (auto.baseTexture !== undefined) {
        this._assertLayer(auto.baseTexture);
        this.shaderData.setInt(TerrainMaterial._autoBase, auto.baseTexture);
      }
      if (auto.overlayTexture !== undefined) {
        this._assertLayer(auto.overlayTexture);
        this.shaderData.setInt(TerrainMaterial._autoOverlay, auto.overlayTexture);
      }
      if (auto.slope !== undefined) {
        this.shaderData.setFloat(TerrainMaterial._autoSlope, this._range("autoShader.slope", auto.slope, 0, 10));
      }
      if (auto.heightReduction !== undefined) {
        this.shaderData.setFloat(
          TerrainMaterial._autoHeightReduction,
          this._range("autoShader.heightReduction", auto.heightReduction, 0, 1)
        );
      }
      if (auto.enabled !== undefined) this._setMacro(TerrainMaterial._autoMacro, auto.enabled);
    }

    const projection = tuning.projection;
    if (projection) {
      if (projection.enabled !== undefined) this.shaderData.setInt(TerrainMaterial._projectionEnabled, projection.enabled ? 1 : 0);
      if (projection.threshold !== undefined) {
        this.shaderData.setFloat(
          TerrainMaterial._projectionThreshold,
          this._range("projection.threshold", projection.threshold, 0, 0.99)
        );
      }
    }

    const dual = tuning.dualScaling;
    if (dual) {
      if (dual.texture !== undefined) {
        this._assertLayer(dual.texture);
        this.shaderData.setInt(TerrainMaterial._dualTexture, dual.texture);
      }
      if (dual.reduction !== undefined) {
        this.shaderData.setFloat(TerrainMaterial._dualReduction, this._range("dualScaling.reduction", dual.reduction, 0.001, 1));
      }
      const near = dual.near === undefined ? this._dualNearValue : this._range("dualScaling.near", dual.near, 0, 1000);
      const far = dual.far === undefined ? this._dualFarValue : this._range("dualScaling.far", dual.far, 0, 1000);
      if (!(far > near)) {
        throw new Error("[TerrainMaterial] dualScaling.far must be greater than dualScaling.near");
      }
      if (dual.near !== undefined) {
        this.shaderData.setFloat(TerrainMaterial._dualNear, near);
        this._dualNearValue = near;
      }
      if (dual.far !== undefined) {
        this.shaderData.setFloat(TerrainMaterial._dualFar, far);
        this._dualFarValue = far;
      }
      if (dual.enabled !== undefined) this._setMacro(TerrainMaterial._dualMacro, dual.enabled);
    }

    const macro = tuning.macroVariation;
    if (macro) {
      if (macro.color1 !== undefined) this.shaderData.setVector3(TerrainMaterial._macroColor1, this._color("macroVariation.color1", macro.color1));
      if (macro.color2 !== undefined) this.shaderData.setVector3(TerrainMaterial._macroColor2, this._color("macroVariation.color2", macro.color2));
      if (macro.slope !== undefined) this.shaderData.setFloat(TerrainMaterial._macroSlope, this._range("macroVariation.slope", macro.slope, 0, 1));
      if (macro.noise1Scale !== undefined) {
        this.shaderData.setFloat(TerrainMaterial._noise1Scale, this._range("macroVariation.noise1Scale", macro.noise1Scale, 0.001, 1));
      }
      if (macro.noise1Angle !== undefined) {
        this.shaderData.setFloat(TerrainMaterial._noise1Angle, this._range("macroVariation.noise1Angle", macro.noise1Angle, 0, 6.283));
      }
      if (macro.noise1Offset !== undefined) {
        const [x, y] = macro.noise1Offset;
        this.shaderData.setVector2(
          TerrainMaterial._noise1Offset,
          new Vector2(this._finite("macroVariation.noise1Offset.x", x), this._finite("macroVariation.noise1Offset.y", y))
        );
      }
      if (macro.noise2Scale !== undefined) {
        this.shaderData.setFloat(TerrainMaterial._noise2Scale, this._range("macroVariation.noise2Scale", macro.noise2Scale, 0.001, 1));
      }
      if (macro.enabled !== undefined) this._setMacro(TerrainMaterial._macroVariationMacro, macro.enabled);
    }
  }

  private _uploadLayerParameters(): void {
    this.shaderData.setFloatArray(TerrainMaterial._uvScales, this._uvScaleValues);
    this.shaderData.setFloatArray(TerrainMaterial._detiling, this._detilingValues);
    this.shaderData.setFloatArray(TerrainMaterial._colors, this._colorValues);
    this.shaderData.setFloatArray(TerrainMaterial._normalDepths, this._normalDepthValues);
    this.shaderData.setFloatArray(TerrainMaterial._aoStrengths, this._aoStrengthValues);
    this.shaderData.setFloatArray(TerrainMaterial._roughnessMods, this._roughnessModValues);
  }

  private _assertLayer(layer: number): void {
    if (!Number.isInteger(layer) || layer < 0 || layer >= this._layerCountValue) {
      throw new Error(`[TerrainMaterial] layer ${layer} is outside 0..${this._layerCountValue - 1}`);
    }
  }

  private _finite(name: string, value: number): number {
    if (!Number.isFinite(value)) throw new Error(`[TerrainMaterial] ${name} must be finite`);
    return value;
  }

  private _range(name: string, value: number, minimum: number, maximum: number): number {
    const finite = this._finite(name, value);
    if (finite < minimum || finite > maximum) {
      throw new Error(`[TerrainMaterial] ${name} must be in ${minimum}..${maximum}`);
    }
    return finite;
  }

  private _integerRange(name: string, value: number, minimum: number, maximum: number): number {
    const finite = this._range(name, value, minimum, maximum);
    if (!Number.isInteger(finite)) throw new Error(`[TerrainMaterial] ${name} must be an integer`);
    return finite;
  }

  private _color(name: string, value: readonly [number, number, number]): Vector3 {
    return new Vector3(this._finite(`${name}.r`, value[0]), this._finite(`${name}.g`, value[1]), this._finite(`${name}.b`, value[2]));
  }

  private _setMacro(macro: ShaderMacro, enabled: boolean): void {
    if (enabled) this.shaderData.enableMacro(macro);
    else this.shaderData.disableMacro(macro);
  }
}
