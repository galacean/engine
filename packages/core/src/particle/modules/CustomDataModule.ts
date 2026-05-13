import { Rand, Vector4 } from "@galacean/engine-math";
import { deepClone, ignoreClone } from "../../clone/CloneManager";
import { ShaderData } from "../../shader/ShaderData";
import { ShaderMacro } from "../../shader/ShaderMacro";
import { ShaderProperty } from "../../shader/ShaderProperty";
import { ParticleCurveMode } from "../enums/ParticleCurveMode";
import { ParticleRandomSubSeeds } from "../enums/ParticleRandomSubSeeds";
import { ParticleGenerator } from "../ParticleGenerator";
import { ParticleCompositeCurve } from "./ParticleCompositeCurve";
import { ParticleGeneratorModule } from "./ParticleGeneratorModule";

/**
 * Custom data stream. Holds 4 ParticleCompositeCurves (xyzw). All four must
 * share the same mode; mixing modes within a stream is not supported.
 */
export class CustomDataStream {
  @deepClone
  x: ParticleCompositeCurve;
  @deepClone
  y: ParticleCompositeCurve;
  @deepClone
  z: ParticleCompositeCurve;
  @deepClone
  w: ParticleCompositeCurve;

  constructor() {
    this.x = new ParticleCompositeCurve(0);
    this.y = new ParticleCompositeCurve(0);
    this.z = new ParticleCompositeCurve(0);
    this.w = new ParticleCompositeCurve(0);
  }
}

/**
 * Custom data module. Exposes two per-particle vec4 streams whose components
 * can be configured as constants or curves over normalized age. Read in shader
 * via `sampleParticleCustomData0/1(attr, normalizedAge)`.
 */
export class CustomDataModule extends ParticleGeneratorModule {
  // Stream 0 macros + properties
  static readonly _data0ConstantModeMacro = ShaderMacro.getByName("RENDERER_CUSTOM_DATA0_CONSTANT_MODE");
  static readonly _data0CurveModeMacro = ShaderMacro.getByName("RENDERER_CUSTOM_DATA0_CURVE_MODE");
  static readonly _data0IsRandomTwoMacro = ShaderMacro.getByName("RENDERER_CUSTOM_DATA0_IS_RANDOM_TWO");

  static readonly _data0MinConstantProperty = ShaderProperty.getByName("renderer_CustomData0MinConst");
  static readonly _data0MaxConstantProperty = ShaderProperty.getByName("renderer_CustomData0MaxConst");
  static readonly _data0MinGradientXProperty = ShaderProperty.getByName("renderer_CustomData0MinGradientX");
  static readonly _data0MinGradientYProperty = ShaderProperty.getByName("renderer_CustomData0MinGradientY");
  static readonly _data0MinGradientZProperty = ShaderProperty.getByName("renderer_CustomData0MinGradientZ");
  static readonly _data0MinGradientWProperty = ShaderProperty.getByName("renderer_CustomData0MinGradientW");
  static readonly _data0MaxGradientXProperty = ShaderProperty.getByName("renderer_CustomData0MaxGradientX");
  static readonly _data0MaxGradientYProperty = ShaderProperty.getByName("renderer_CustomData0MaxGradientY");
  static readonly _data0MaxGradientZProperty = ShaderProperty.getByName("renderer_CustomData0MaxGradientZ");
  static readonly _data0MaxGradientWProperty = ShaderProperty.getByName("renderer_CustomData0MaxGradientW");

  // Stream 1 macros + properties
  static readonly _data1ConstantModeMacro = ShaderMacro.getByName("RENDERER_CUSTOM_DATA1_CONSTANT_MODE");
  static readonly _data1CurveModeMacro = ShaderMacro.getByName("RENDERER_CUSTOM_DATA1_CURVE_MODE");
  static readonly _data1IsRandomTwoMacro = ShaderMacro.getByName("RENDERER_CUSTOM_DATA1_IS_RANDOM_TWO");

  static readonly _data1MinConstantProperty = ShaderProperty.getByName("renderer_CustomData1MinConst");
  static readonly _data1MaxConstantProperty = ShaderProperty.getByName("renderer_CustomData1MaxConst");
  static readonly _data1MinGradientXProperty = ShaderProperty.getByName("renderer_CustomData1MinGradientX");
  static readonly _data1MinGradientYProperty = ShaderProperty.getByName("renderer_CustomData1MinGradientY");
  static readonly _data1MinGradientZProperty = ShaderProperty.getByName("renderer_CustomData1MinGradientZ");
  static readonly _data1MinGradientWProperty = ShaderProperty.getByName("renderer_CustomData1MinGradientW");
  static readonly _data1MaxGradientXProperty = ShaderProperty.getByName("renderer_CustomData1MaxGradientX");
  static readonly _data1MaxGradientYProperty = ShaderProperty.getByName("renderer_CustomData1MaxGradientY");
  static readonly _data1MaxGradientZProperty = ShaderProperty.getByName("renderer_CustomData1MaxGradientZ");
  static readonly _data1MaxGradientWProperty = ShaderProperty.getByName("renderer_CustomData1MaxGradientW");

  /** Custom data stream 0 (read in shader as `sampleParticleCustomData0(...)`). */
  @deepClone
  readonly data0 = new CustomDataStream();
  /** Custom data stream 1 (read in shader as `sampleParticleCustomData1(...)`). */
  @deepClone
  readonly data1 = new CustomDataStream();

  /** @internal */
  @ignoreClone
  _data0Rand = new Rand(0, ParticleRandomSubSeeds.CustomData0);
  /** @internal */
  @ignoreClone
  _data1Rand = new Rand(0, ParticleRandomSubSeeds.CustomData1);

  @ignoreClone
  private _data0MinConstant = new Vector4();
  @ignoreClone
  private _data0MaxConstant = new Vector4();
  @ignoreClone
  private _data1MinConstant = new Vector4();
  @ignoreClone
  private _data1MaxConstant = new Vector4();

  @ignoreClone
  private _data0ModeMacro: ShaderMacro;
  @ignoreClone
  private _data0RandomMacro: ShaderMacro;
  @ignoreClone
  private _data1ModeMacro: ShaderMacro;
  @ignoreClone
  private _data1RandomMacro: ShaderMacro;

  constructor(generator: ParticleGenerator) {
    super(generator);
  }

  /**
   * @internal
   */
  _updateShaderData(shaderData: ShaderData): void {
    let data0ModeMacro = <ShaderMacro>null;
    let data0RandomMacro = <ShaderMacro>null;
    let data1ModeMacro = <ShaderMacro>null;
    let data1RandomMacro = <ShaderMacro>null;

    if (this.enabled) {
      data0ModeMacro = this._uploadStream(
        shaderData,
        this.data0,
        this._data0MinConstant,
        this._data0MaxConstant,
        CustomDataModule._data0ConstantModeMacro,
        CustomDataModule._data0CurveModeMacro,
        CustomDataModule._data0MinConstantProperty,
        CustomDataModule._data0MaxConstantProperty,
        CustomDataModule._data0MinGradientXProperty,
        CustomDataModule._data0MinGradientYProperty,
        CustomDataModule._data0MinGradientZProperty,
        CustomDataModule._data0MinGradientWProperty,
        CustomDataModule._data0MaxGradientXProperty,
        CustomDataModule._data0MaxGradientYProperty,
        CustomDataModule._data0MaxGradientZProperty,
        CustomDataModule._data0MaxGradientWProperty
      );
      if (CustomDataModule._streamIsRandomTwo(this.data0)) {
        data0RandomMacro = CustomDataModule._data0IsRandomTwoMacro;
      }

      data1ModeMacro = this._uploadStream(
        shaderData,
        this.data1,
        this._data1MinConstant,
        this._data1MaxConstant,
        CustomDataModule._data1ConstantModeMacro,
        CustomDataModule._data1CurveModeMacro,
        CustomDataModule._data1MinConstantProperty,
        CustomDataModule._data1MaxConstantProperty,
        CustomDataModule._data1MinGradientXProperty,
        CustomDataModule._data1MinGradientYProperty,
        CustomDataModule._data1MinGradientZProperty,
        CustomDataModule._data1MinGradientWProperty,
        CustomDataModule._data1MaxGradientXProperty,
        CustomDataModule._data1MaxGradientYProperty,
        CustomDataModule._data1MaxGradientZProperty,
        CustomDataModule._data1MaxGradientWProperty
      );
      if (CustomDataModule._streamIsRandomTwo(this.data1)) {
        data1RandomMacro = CustomDataModule._data1IsRandomTwoMacro;
      }
    }

    this._data0ModeMacro = this._enableMacro(shaderData, this._data0ModeMacro, data0ModeMacro);
    this._data0RandomMacro = this._enableMacro(shaderData, this._data0RandomMacro, data0RandomMacro);
    this._data1ModeMacro = this._enableMacro(shaderData, this._data1ModeMacro, data1ModeMacro);
    this._data1RandomMacro = this._enableMacro(shaderData, this._data1RandomMacro, data1RandomMacro);
  }

  /**
   * @internal
   */
  _resetRandomSeed(seed: number): void {
    this._data0Rand.reset(seed, ParticleRandomSubSeeds.CustomData0);
    this._data1Rand.reset(seed, ParticleRandomSubSeeds.CustomData1);
  }

  private _uploadStream(
    shaderData: ShaderData,
    stream: CustomDataStream,
    minConstantCache: Vector4,
    maxConstantCache: Vector4,
    constantModeMacro: ShaderMacro,
    curveModeMacro: ShaderMacro,
    minConstantProp: ShaderProperty,
    maxConstantProp: ShaderProperty,
    minGradientXProp: ShaderProperty,
    minGradientYProp: ShaderProperty,
    minGradientZProp: ShaderProperty,
    minGradientWProp: ShaderProperty,
    maxGradientXProp: ShaderProperty,
    maxGradientYProp: ShaderProperty,
    maxGradientZProp: ShaderProperty,
    maxGradientWProp: ShaderProperty
  ): ShaderMacro {
    const { x, y, z, w } = stream;
    const mode = x.mode;
    if (y.mode !== mode || z.mode !== mode || w.mode !== mode) {
      throw new Error("CustomDataModule: all four components of a stream must share the same mode.");
    }

    if (mode === ParticleCurveMode.Curve || mode === ParticleCurveMode.TwoCurves) {
      shaderData.setFloatArray(maxGradientXProp, x.curveMax._getTypeArray());
      shaderData.setFloatArray(maxGradientYProp, y.curveMax._getTypeArray());
      shaderData.setFloatArray(maxGradientZProp, z.curveMax._getTypeArray());
      shaderData.setFloatArray(maxGradientWProp, w.curveMax._getTypeArray());
      if (mode === ParticleCurveMode.TwoCurves) {
        shaderData.setFloatArray(minGradientXProp, x.curveMin._getTypeArray());
        shaderData.setFloatArray(minGradientYProp, y.curveMin._getTypeArray());
        shaderData.setFloatArray(minGradientZProp, z.curveMin._getTypeArray());
        shaderData.setFloatArray(minGradientWProp, w.curveMin._getTypeArray());
      }
      return curveModeMacro;
    }

    maxConstantCache.set(x.constantMax, y.constantMax, z.constantMax, w.constantMax);
    shaderData.setVector4(maxConstantProp, maxConstantCache);
    if (mode === ParticleCurveMode.TwoConstants) {
      minConstantCache.set(x.constantMin, y.constantMin, z.constantMin, w.constantMin);
      shaderData.setVector4(minConstantProp, minConstantCache);
    }
    return constantModeMacro;
  }

  private static _streamIsRandomTwo(stream: CustomDataStream): boolean {
    const mode = stream.x.mode;
    return mode === ParticleCurveMode.TwoConstants || mode === ParticleCurveMode.TwoCurves;
  }
}
