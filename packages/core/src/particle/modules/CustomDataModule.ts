import { Color, Vector4 } from "@galacean/engine-math";
import { CloneManager, ignoreClone } from "../../clone/CloneManager";
import { Logger } from "../../base/Logger";
import { ShaderData } from "../../shader/ShaderData";
import { ShaderProperty } from "../../shader/ShaderProperty";
import { ParticleCurveMode } from "../enums/ParticleCurveMode";
import { ParticleGradientMode } from "../enums/ParticleGradientMode";
import { ParticleGenerator } from "../ParticleGenerator";
import { ParticleCompositeCurve } from "./ParticleCompositeCurve";
import { ParticleCompositeGradient } from "./ParticleCompositeGradient";
import { ParticleGeneratorModule } from "./ParticleGeneratorModule";

const STREAM_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

interface CurveStreamMeta {
  curve: ParticleCompositeCurve;
  propMaxConst: ShaderProperty;
  propMinConst: ShaderProperty;
  propMaxGradient: ShaderProperty;
  propMinGradient: ShaderProperty;
}

interface GradientStreamMeta {
  gradient: ParticleCompositeGradient;
  propMaxConst: ShaderProperty;
  propMinConst: ShaderProperty;
  maxColorCache: Vector4;
  minColorCache: Vector4;
}

/**
 * Custom data module — exposes any number of named per-particle data channels
 * (scalars or colors) readable from a custom particle shader by their generated
 * `renderer_<name>...` uniforms.
 */
export class CustomDataModule extends ParticleGeneratorModule {
  private static readonly _zeroCurveArray = new Float32Array(8);
  private static readonly _zeroColor = new Vector4();

  private _curves: Record<string, ParticleCompositeCurve> = {};
  private _gradients: Record<string, ParticleCompositeGradient> = {};

  @ignoreClone
  private _curveStreams: Record<string, CurveStreamMeta> = {};
  @ignoreClone
  private _gradientStreams: Record<string, GradientStreamMeta> = {};

  /**
   * Registered scalar streams keyed by name.
   *
   * @returns A readonly map from stream name to its `ParticleCompositeCurve`
   */
  get curves(): Readonly<Record<string, ParticleCompositeCurve>> {
    return this._curves;
  }

  /**
   * Registered color streams keyed by name.
   *
   * @returns A readonly map from stream name to its `ParticleCompositeGradient`
   */
  get gradients(): Readonly<Record<string, ParticleCompositeGradient>> {
    return this._gradients;
  }

  /**
   * Create a custom data module bound to a particle generator.
   *
   * @param generator - The particle generator this module belongs to
   */
  constructor(generator: ParticleGenerator) {
    super(generator);
  }

  /**
   * Register a scalar stream. Shader-side uniforms by `curve.mode`:
   *
   * | Mode         | Uniforms                                                                   |
   * |--------------|----------------------------------------------------------------------------|
   * | Constant     | `float renderer_<name>MaxConst`                                            |
   * | TwoConstants | `float renderer_<name>MaxConst`, `float renderer_<name>MinConst`           |
   * | Curve        | `vec2 renderer_<name>MaxGradient[4]`                                       |
   * | TwoCurves    | `vec2 renderer_<name>MaxGradient[4]`, `vec2 renderer_<name>MinGradient[4]` |
   *
   * @param name  - Must be a valid GLSL identifier and not already registered.
   * @param curve - Stored by reference.
   */
  addCurve(name: string, curve: ParticleCompositeCurve): void {
    if (!this._validateName(name, "addCurve")) {
      return;
    }
    this._curves[name] = curve;
    this._curveStreams[name] = {
      curve,
      propMaxConst: ShaderProperty.getByName(`renderer_${name}MaxConst`),
      propMinConst: ShaderProperty.getByName(`renderer_${name}MinConst`),
      propMaxGradient: ShaderProperty.getByName(`renderer_${name}MaxGradient`),
      propMinGradient: ShaderProperty.getByName(`renderer_${name}MinGradient`)
    };
  }

  /**
   * Register a color stream. Shader-side uniforms by `gradient.mode`
   * (only `Constant` / `TwoConstants` supported here):
   *
   * | Mode         | Uniforms                                                       |
   * |--------------|----------------------------------------------------------------|
   * | Constant     | `vec4 renderer_<name>MaxConst`                                 |
   * | TwoConstants | `vec4 renderer_<name>MaxConst`, `vec4 renderer_<name>MinConst` |
   *
   * @param name     - Same validation as {@link addCurve}.
   * @param gradient - Stored by reference.
   */
  addGradient(name: string, gradient: ParticleCompositeGradient): void {
    if (!this._validateName(name, "addGradient")) {
      return;
    }
    this._gradients[name] = gradient;
    this._gradientStreams[name] = {
      gradient,
      propMaxConst: ShaderProperty.getByName(`renderer_${name}MaxConst`),
      propMinConst: ShaderProperty.getByName(`renderer_${name}MinConst`),
      maxColorCache: new Vector4(),
      minColorCache: new Vector4()
    };
  }

  /**
   * Unregister a scalar stream. Shader uniforms read 0 once unregistered.
   * @param name - The name passed to {@link addCurve}
   */
  removeCurve(name: string): void {
    const meta = this._curveStreams[name];
    if (!meta) {
      return;
    }
    const shaderData = this._generator._renderer.shaderData;
    shaderData.setFloat(meta.propMaxConst, 0);
    shaderData.setFloat(meta.propMinConst, 0);
    shaderData.setFloatArray(meta.propMaxGradient, CustomDataModule._zeroCurveArray);
    shaderData.setFloatArray(meta.propMinGradient, CustomDataModule._zeroCurveArray);
    delete this._curveStreams[name];
    delete this._curves[name];
  }

  /**
   * Unregister a color stream. Shader uniforms read 0 once unregistered.
   * @param name - The name passed to {@link addGradient}
   */
  removeGradient(name: string): void {
    const meta = this._gradientStreams[name];
    if (!meta) {
      return;
    }
    const shaderData = this._generator._renderer.shaderData;
    shaderData.setVector4(meta.propMaxConst, CustomDataModule._zeroColor);
    shaderData.setVector4(meta.propMinConst, CustomDataModule._zeroColor);
    delete this._gradientStreams[name];
    delete this._gradients[name];
  }

  /** @internal */
  _cloneTo(target: CustomDataModule): void {
    const sourceCurves = this._curves;
    const sourceGradients = this._gradients;
    const curveNames = Object.keys(sourceCurves);
    const gradientNames = Object.keys(sourceGradients);

    target._curves = {};
    target._gradients = {};
    target._curveStreams = {};
    target._gradientStreams = {};

    for (let i = 0; i < curveNames.length; i++) {
      const name = curveNames[i];
      const clonedCurve = new ParticleCompositeCurve(0);
      CloneManager.deepCloneObject(sourceCurves[name], clonedCurve, new Map());
      target.addCurve(name, clonedCurve);
    }
    for (let i = 0; i < gradientNames.length; i++) {
      const name = gradientNames[i];
      const clonedGradient = new ParticleCompositeGradient(new Color());
      CloneManager.deepCloneObject(sourceGradients[name], clonedGradient, new Map());
      target.addGradient(name, clonedGradient);
    }
  }

  /**
   * @internal
   */
  _updateShaderData(shaderData: ShaderData): void {
    if (!this.enabled) {
      return;
    }
    for (const name in this._curveStreams) {
      this._uploadCurveStream(shaderData, this._curveStreams[name]);
    }
    for (const name in this._gradientStreams) {
      this._uploadGradientStream(shaderData, this._gradientStreams[name], name);
    }
  }

  private _uploadCurveStream(shaderData: ShaderData, meta: CurveStreamMeta): void {
    const { curve } = meta;
    const mode = curve.mode;
    if (mode === ParticleCurveMode.Curve || mode === ParticleCurveMode.TwoCurves) {
      shaderData.setFloatArray(meta.propMaxGradient, curve.curveMax._getTypeArray());
      if (mode === ParticleCurveMode.TwoCurves) {
        shaderData.setFloatArray(meta.propMinGradient, curve.curveMin._getTypeArray());
      }
    } else {
      shaderData.setFloat(meta.propMaxConst, curve.constantMax);
      if (mode === ParticleCurveMode.TwoConstants) {
        shaderData.setFloat(meta.propMinConst, curve.constantMin);
      }
    }
  }

  private _uploadGradientStream(shaderData: ShaderData, meta: GradientStreamMeta, name: string): void {
    const { gradient } = meta;
    const mode = gradient.mode;

    if (mode !== ParticleGradientMode.Constant && mode !== ParticleGradientMode.TwoConstants) {
      throw new Error(
        `Invalid gradient mode for CustomDataModule stream "${name}", only constant and twoConstants are supported.`
      );
    }

    const max = gradient.constantMax;
    meta.maxColorCache.set(max.r, max.g, max.b, max.a);
    shaderData.setVector4(meta.propMaxConst, meta.maxColorCache);
    if (mode === ParticleGradientMode.TwoConstants) {
      const min = gradient.constantMin;
      meta.minColorCache.set(min.r, min.g, min.b, min.a);
      shaderData.setVector4(meta.propMinConst, meta.minColorCache);
    }
  }

  private _validateName(name: string, method: string): boolean {
    if (!STREAM_NAME_PATTERN.test(name)) {
      Logger.error(
        `CustomDataModule.${method}: "${name}" is not a valid GLSL identifier ` +
          `([A-Za-z_][A-Za-z0-9_]*); call ignored.`
      );
      return false;
    }
    if (name in this._curves || name in this._gradients) {
      Logger.error(`CustomDataModule.${method}: stream "${name}" is already registered; call ignored.`);
      return false;
    }
    return true;
  }
}
