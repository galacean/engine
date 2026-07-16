import { BaseMaterial, Engine, Shader, ShaderProperty, Texture2DArray } from "@galacean/engine";

export enum TerrainDebugMode {
  Off = 0,
  /**
   * Highlight texels where the *baked* controlmap base_id (bits 31-27) OR overlay_id (bits 26-22)
   * equals DebugLayerId. Reads raw controlmap values (before autoshader override) so the mask
   * shows what the baker wrote.
   */
  LayerMask = 1,
  /** Highlight texels with controlmap bit 2 (hole) = 1. */
  HoleMask = 2,
  /** Highlight texels with controlmap bit 1 (navigation) = 1. */
  NavMask = 3,
  /** Grayscale render of baked blend weight (bits 21-14, 0-255 → 0-1). Raw value, no auto override. */
  BlendWeight = 4,
  /** Grayscale render of uv rotation (bits 13-11, 0-15 → 0-1). */
  UvRotation = 5,
  /** Grayscale render of uv scale (bits 10-8, 0-7 → 0-1). */
  UvScale = 6,
  /** Grayscale render of the heightmap itself (renderer_HeightMap sample, normalised via HeightRange). */
  HeightmapView = 7,
  /** Highlight texels with controlmap bit 0 (autoshader opt-in) = 1. */
  AutoshaderMask = 8,
  /** Grayscale render of the baked base_id / 31 — shows which layer each texel picks as base. */
  BaseIdView = 9,
  /** Grayscale render of the baked overlay_id / 31 — same for overlay slot. */
  OverlayIdView = 10
}

/**
 * Material for the "Terrain" shader.
 *
 * Autoshader (T3D auto_shader.glsl) lives here: `AutoBaseId / AutoOverlayId / AutoSlope /
 * AutoHeightReduction` are the T3D uniforms the shader consumes on every texel whose controlmap
 * bit 0 = 1. Baker sets bit 0 for above-sealevel texels by default, so tweaking these params
 * updates the whole island in real time; a future painter would clear bit 0 on hand-painted texels
 * to lock them against these globals.
 */
export class TerrainMaterial extends BaseMaterial {
  private static readonly _albedoArrayProp = ShaderProperty.getByName("material_LayerAlbedoArray");
  private static readonly _normalArrayProp = ShaderProperty.getByName("material_LayerNormalArray");
  private static readonly _uvScalesProp = ShaderProperty.getByName("material_LayerUvScales");
  private static readonly _normalIntensitiesProp = ShaderProperty.getByName("material_LayerNormalIntensities");
  private static readonly _autoSlopeProp = ShaderProperty.getByName("material_AutoSlope");
  private static readonly _autoHeightReductionProp = ShaderProperty.getByName("material_AutoHeightReduction");
  private static readonly _debugModeProp = ShaderProperty.getByName("material_DebugMode");
  private static readonly _debugLayerIdProp = ShaderProperty.getByName("material_DebugLayerId");

  private _uvScales = new Float32Array(8);
  private _normalIntensities = new Float32Array(8);

  constructor(engine: Engine) {
    const shader = Shader.find("Terrain");
    if (!shader) throw new Error(`[TerrainMaterial] Shader "Terrain" not registered. Call Shader.create(source).`);
    super(engine, shader);
    this._uvScales.fill(1);
    this._normalIntensities.fill(1);
    this.shaderData.setFloatArray(TerrainMaterial._uvScalesProp, this._uvScales);
    this.shaderData.setFloatArray(TerrainMaterial._normalIntensitiesProp, this._normalIntensities);
    this.setAutoshader(1.0, 0);
    this.setDebug(TerrainDebugMode.Off, 0);
  }

  setLayerAlbedoArray(tex: Texture2DArray): void {
    this.shaderData.setTexture(TerrainMaterial._albedoArrayProp, tex);
  }

  setLayerNormalArray(tex: Texture2DArray): void {
    this.shaderData.setTexture(TerrainMaterial._normalArrayProp, tex);
  }

  setLayerUvScale(index: number, scale: number): void {
    this._uvScales[index] = scale;
    this.shaderData.setFloatArray(TerrainMaterial._uvScalesProp, this._uvScales);
  }

  setLayerNormalIntensity(index: number, intensity: number): void {
    this._normalIntensities[index] = intensity;
    this.shaderData.setFloatArray(TerrainMaterial._normalIntensitiesProp, this._normalIntensities);
  }

  /**
   * Configure autoshader (applies to texels where controlmap bit 0 = 1).
   * Only affects the BLEND weight — base / overlay layer ids come from controlmap.
   * @param slope T3D auto_slope [0..10] — higher = sharper base→overlay transition.
   * @param heightReduction T3D auto_height_reduction [0..1] — reduce overlay coverage at altitude.
   */
  setAutoshader(slope: number, heightReduction: number): void {
    this.shaderData.setFloat(TerrainMaterial._autoSlopeProp, slope);
    this.shaderData.setFloat(TerrainMaterial._autoHeightReductionProp, heightReduction);
  }

  setDebug(mode: TerrainDebugMode, layerId: number): void {
    this.shaderData.setInt(TerrainMaterial._debugModeProp, mode);
    this.shaderData.setInt(TerrainMaterial._debugLayerIdProp, layerId);
  }
}
