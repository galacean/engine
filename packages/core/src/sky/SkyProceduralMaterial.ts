import { Color } from "@galacean/engine-math";
import { Engine } from "../Engine";
import { Material } from "../material/Material";
import { CompareFunction, CullMode, Shader, ShaderMacro } from "../shader";
import { ShaderProperty } from "../shader/ShaderProperty";

/**
 * Sun mode.
 */
export enum SunMode {
  /** None */
  None,
  /** Simple sun. */
  Simple,
  /** High quality sun. */
  HighQuality
}

/**
 * Sky procedural material.
 */
export class SkyProceduralMaterial extends Material {
  private static _sunSizeProp: ShaderProperty = ShaderProperty.getByName("material_SunSize");
  private static _sunSizeConvergenceProp: ShaderProperty = ShaderProperty.getByName("material_SunSizeConvergence");
  private static _atmosphereThicknessProp: ShaderProperty = ShaderProperty.getByName("material_AtmosphereThickness");
  private static _skyTintProp: ShaderProperty = ShaderProperty.getByName("material_SkyTint");
  private static _groundTintProp: ShaderProperty = ShaderProperty.getByName("material_GroundTint");
  private static _exposureProp: ShaderProperty = ShaderProperty.getByName("material_Exposure");

  private static _sunHighQualityMacro: ShaderMacro = ShaderMacro.getByName("MATERIAL_SUN_HIGH_QUALITY");
  private static _sunSimpleMacro: ShaderMacro = ShaderMacro.getByName("MATERIAL_SUN_SIMPLE");

  private _sunDisk: SunMode;

  /**
   * Sun mode.
   */
  get sunMode(): SunMode {
    return this._sunDisk;
  }

  set sunMode(value: SunMode) {
    const shaderData = this.shaderData;
    switch (value) {
      case SunMode.HighQuality:
        shaderData.disableMacro(SkyProceduralMaterial._sunSimpleMacro);
        shaderData.enableMacro(SkyProceduralMaterial._sunHighQualityMacro);
        break;
      case SunMode.Simple:
        shaderData.disableMacro(SkyProceduralMaterial._sunHighQualityMacro);
        shaderData.enableMacro(SkyProceduralMaterial._sunSimpleMacro);
        break;
      case SunMode.None:
        shaderData.disableMacro(SkyProceduralMaterial._sunHighQualityMacro);
        shaderData.disableMacro(SkyProceduralMaterial._sunSimpleMacro);
        break;
      default:
        throw "SkyBoxProceduralMaterial: unknown sun value.";
    }
    this._sunDisk = value;
  }

  /**
   * Sun size, range is 0 to 1.
   */
  get sunSize(): number {
    return this.shaderData.getFloat(SkyProceduralMaterial._sunSizeProp);
  }

  set sunSize(value: number) {
    this.shaderData.setFloat(SkyProceduralMaterial._sunSizeProp, Math.min(Math.max(0.0, value), 1.0));
  }

  /**
   * Sun size convergence, range is 0 to 20.
   */
  get sunSizeConvergence(): number {
    return this.shaderData.getFloat(SkyProceduralMaterial._sunSizeConvergenceProp);
  }

  set sunSizeConvergence(value: number) {
    this.shaderData.setFloat(SkyProceduralMaterial._sunSizeConvergenceProp, Math.min(Math.max(0.0, value), 20.0));
  }

  /**
   * Atmosphere thickness, range is 0 to 5.
   */
  get atmosphereThickness(): number {
    return this.shaderData.getFloat(SkyProceduralMaterial._atmosphereThicknessProp);
  }

  set atmosphereThickness(value: number) {
    this.shaderData.setFloat(SkyProceduralMaterial._atmosphereThicknessProp, Math.min(Math.max(0.0, value), 5.0));
  }

  /**
   * Sky tint.
   */
  get skyTint(): Color {
    return this.shaderData.getColor(SkyProceduralMaterial._skyTintProp);
  }

  set skyTint(value: Color) {
    this.shaderData.setColor(SkyProceduralMaterial._skyTintProp, value);
  }

  /**
   * Ground tint.
   */
  get groundTint(): Color {
    return this.shaderData.getColor(SkyProceduralMaterial._groundTintProp);
  }

  set groundTint(value: Color) {
    this.shaderData.setColor(SkyProceduralMaterial._groundTintProp, value);
  }

  /**
   * Exposure, range is 0 to 8.
   */
  get exposure(): number {
    return this.shaderData.getFloat(SkyProceduralMaterial._exposureProp);
  }

  set exposure(value: number) {
    this.shaderData.setFloat(SkyProceduralMaterial._exposureProp, Math.min(Math.max(0.0, value), 8.0));
  }

  /**
   * Constructor a SkyBoxProceduralMaterial instance.
   * @param engine - Engine to which the material belongs
   */
  constructor(engine: Engine) {
    super(engine, engine.shaderPool.find("SkyProcedural"));
    this.sunMode = SunMode.HighQuality;
    this.sunSize = 0.04;
    this.sunSizeConvergence = 5;
    this.atmosphereThickness = 1.0;
    this.skyTint = new Color(0.5, 0.5, 0.5, 1.0);
    this.groundTint = new Color(0.369, 0.349, 0.341, 1.0);
    this.exposure = 1.3;

    this.renderState.rasterState.cullMode = CullMode.Off;
    this.renderState.depthState.compareFunction = CompareFunction.LessEqual;
  }

  /**
   * @inheritDoc
   */
  override clone(): SkyProceduralMaterial {
    const dest = new SkyProceduralMaterial(this._engine);
    this.cloneTo(dest);
    return dest;
  }
}
