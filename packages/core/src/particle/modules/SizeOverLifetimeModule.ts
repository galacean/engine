import { ShaderData } from "../../shader/ShaderData";
import { ShaderMacro } from "../../shader/ShaderMacro";
import { ShaderProperty } from "../../shader/ShaderProperty";
import { ParticleCurveMode } from "../enums/ParticleCurveMode";
import { ParticleCompositeCurve } from "./ParticleCompositeCurve";
import { Key, ParticleCurve } from "./ParticleCurve";
import { ParticleGeneratorModule } from "./ParticleGeneratorModule";

/**
 * Size over lifetime module.
 */
export class SizeOverLifetimeModule extends ParticleGeneratorModule {
  static readonly _curveMacro = ShaderMacro.getByName("RENDERER_SOL_CURVE");
  static readonly _curveSeparateMacro = ShaderMacro.getByName("RENDERER_SOL_CURVE_SEPARATE");
  static readonly _randomCurvesMacro = ShaderMacro.getByName("RENDERER_SOL_RANDOM_CURVES");
  static readonly _randomCurvesSeparateMacro = ShaderMacro.getByName("RENDERER_SOL_RANDOM_CURVES_SEPARATE");

  static readonly _sizeCurveMinXProperty = ShaderProperty.getByName("renderer_SOLMinCurveX");
  static readonly _sizeCurveMinYProperty = ShaderProperty.getByName("renderer_SOLMinCurveY");
  static readonly _sizeCurveMinZProperty = ShaderProperty.getByName("renderer_SOLMinCurveZ");
  static readonly _sizeCurveMaxXProperty = ShaderProperty.getByName("renderer_SOLMaxCurveX");
  static readonly _sizeCurveMaxYProperty = ShaderProperty.getByName("renderer_SOLMaxCurveY");
  static readonly _sizeCurveMaxZProperty = ShaderProperty.getByName("renderer_SOLMaxCurveZ");

  /** Specifies whether the Size is separate on each axis. */
  separateAxes = false;

  private _sizeX = new ParticleCompositeCurve(new ParticleCurve(new Key(0, 0), new Key(1, 1)));
  private _sizeY = new ParticleCompositeCurve(new ParticleCurve(new Key(0, 0), new Key(1, 1)));
  private _sizeZ = new ParticleCompositeCurve(new ParticleCurve(new Key(0, 0), new Key(1, 1)));
  private _lastSizeMacro: ShaderMacro;

  /**
   * Size over lifetime.
   */
  get size(): ParticleCompositeCurve {
    return this._sizeY;
  }

  set size(value: ParticleCompositeCurve) {
    this._sizeY = value;
  }

  /**
   * Size over lifetime for x axis.
   */
  get sizeX(): ParticleCompositeCurve {
    return this._sizeX;
  }

  set sizeX(value: ParticleCompositeCurve) {
    this._sizeX = value;
  }

  /**
   * Size over lifetime for y axis.
   */
  get sizeY(): ParticleCompositeCurve {
    return this._sizeY;
  }

  set sizeY(value: ParticleCompositeCurve) {
    this._sizeY = value;
  }

  /**
   * Size over lifetime for z axis.
   */
  get sizeZ(): ParticleCompositeCurve {
    return this._sizeZ;
  }

  set sizeZ(value: ParticleCompositeCurve) {
    this._sizeZ = value;
  }

  /**
   * @inheritDoc
   */
  cloneTo(destRotationOverLifetime: SizeOverLifetimeModule): void {}

  /**
   * @internal
   */
  _updateShaderData(shaderData: ShaderData): void {
    const isRandomMode = this._sizeX.mode === ParticleCurveMode.TwoCurves;
    const isSeparateRandomMode =
      isRandomMode &&
      this._sizeY.mode === ParticleCurveMode.TwoCurves &&
      this._sizeZ.mode === ParticleCurveMode.TwoCurves;

    const sizeMacro = this.enabled
      ? this.separateAxes
        ? isSeparateRandomMode
          ? SizeOverLifetimeModule._randomCurvesSeparateMacro
          : SizeOverLifetimeModule._curveSeparateMacro
        : isRandomMode
        ? SizeOverLifetimeModule._randomCurvesMacro
        : SizeOverLifetimeModule._curveMacro
      : null;

    const lastSizeMacro = this._lastSizeMacro;
    if (lastSizeMacro !== sizeMacro) {
      lastSizeMacro && shaderData.disableMacro(lastSizeMacro);
      this._lastSizeMacro = sizeMacro;
    }

    if (sizeMacro) {
      shaderData.enableMacro(sizeMacro);

      shaderData.setFloatArray(SizeOverLifetimeModule._sizeCurveMaxXProperty, this._sizeX.curveMax._getTypeArray());
      if (isRandomMode) {
        shaderData.setFloatArray(SizeOverLifetimeModule._sizeCurveMinXProperty, this._sizeX.curveMin._getTypeArray());
      }

      if (this.separateAxes) {
        shaderData.setFloatArray(SizeOverLifetimeModule._sizeCurveMaxYProperty, this._sizeY.curveMax._getTypeArray());
        shaderData.setFloatArray(SizeOverLifetimeModule._sizeCurveMaxZProperty, this._sizeZ.curveMax._getTypeArray());

        if (isSeparateRandomMode) {
          shaderData.setFloatArray(SizeOverLifetimeModule._sizeCurveMinYProperty, this._sizeY.curveMin._getTypeArray());
          shaderData.setFloatArray(SizeOverLifetimeModule._sizeCurveMinZProperty, this._sizeZ.curveMin._getTypeArray());
        }
      }
    }
  }
}
