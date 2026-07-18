import { Color, Vector4 } from "@galacean/engine-math";
import { Logger } from "../../base/Logger";
import { ShaderData } from "../../shader/ShaderData";
import { ShaderProperty } from "../../shader/ShaderProperty";
import { ParticleCurveMode } from "../enums/ParticleCurveMode";
import { ParticleGradientMode } from "../enums/ParticleGradientMode";
import { ParticleCompositeCurve } from "./ParticleCompositeCurve";
import { ParticleCompositeGradient } from "./ParticleCompositeGradient";
import { ParticleGeneratorModule } from "./ParticleGeneratorModule";

interface CurveStream {
  name: string;
  curve: ParticleCompositeCurve;
  lastMode: ParticleCurveMode;
  propMaxConst: ShaderProperty;
  propMinConst: ShaderProperty;
  propMaxGradient: ShaderProperty;
  propMinGradient: ShaderProperty;
}

interface GradientStream {
  name: string;
  gradient: ParticleCompositeGradient;
  lastMode: ParticleGradientMode;
  propMaxConst: ShaderProperty;
  propMinConst: ShaderProperty;
  propMaxGradientColor: ShaderProperty;
  propMaxGradientAlpha: ShaderProperty;
  propMinGradientColor: ShaderProperty;
  propMinGradientAlpha: ShaderProperty;
  propKeysCount: ShaderProperty;
  keysCountCache: Vector4;
}

/**
 * Custom data module — exposes any number of named per-particle data channels
 * (scalars or colors) readable from a custom particle shader by their generated
 * `renderer_<name>...` uniforms.
 *
 * Each stream is one uniform shared across the drawcall, not a per-particle
 * attribute (unlike Unity's `SetCustomParticleData`); shader-side
 * differentiation must mix in `a_Random*` / `normalizedAge` / etc.
 *
 * Register streams BEFORE attaching the entity to the scene — `ParticleRenderer._onEnable`
 * uploads on the first frame and won't see entries added afterward.
 */
export class CustomDataModule extends ParticleGeneratorModule {
  private static readonly _streamNamePattern = /^[A-Za-z0-9_]+$/;
  private static readonly _zeroCurveArray = new Float32Array(8);
  private static readonly _zeroGradientColorArray = new Float32Array(16);
  private static readonly _zeroGradientAlphaArray = new Float32Array(8);
  private static readonly _zeroColor = new Color(0, 0, 0, 0);
  private static readonly _zeroVector4 = new Vector4(0, 0, 0, 0);

  private _curves: Map<string, ParticleCompositeCurve> = new Map();
  private _gradients: Map<string, ParticleCompositeGradient> = new Map();

  // Cloned by the gate alongside `_curves` / `_gradients`: the identity map makes each stream's
  // `curve` / `gradient` land on the same clone the map holds, and a `ShaderProperty` — a plain
  // class registered globally by name — is shared rather than copied.
  private _curveStreams: CurveStream[] = [];
  private _gradientStreams: GradientStream[] = [];

  /**
   * Curves keyed by name.
   */
  get curves(): ReadonlyMap<string, ParticleCompositeCurve> {
    return this._curves;
  }

  /**
   * Gradients keyed by name.
   */
  get gradients(): ReadonlyMap<string, ParticleCompositeGradient> {
    return this._gradients;
  }

  /**
   * Add a scalar curve. Shader-side uniforms by `curve.mode`:
   *
   * | Mode         | Uniforms                                |
   * |--------------|-----------------------------------------|
   * | Constant     | `float renderer_<name>MaxConst`         |
   * | TwoConstants | + `float renderer_<name>MinConst`       |
   * | Curve        | `vec2 renderer_<name>MaxGradient[4]`    |
   * | TwoCurves    | + `vec2 renderer_<name>MinGradient[4]`  |
   *
   * @param name  - Must contain only letters, digits, or underscores, and not already be in use.
   * @param curve - Stored by reference.
   */
  addCurve(name: string, curve: ParticleCompositeCurve): void {
    if (!this._validateName(name, "addCurve")) {
      return;
    }
    this._curves.set(name, curve);
    this._curveStreams.push({
      name,
      curve,
      lastMode: curve.mode,
      propMaxConst: ShaderProperty.getByName(`renderer_${name}MaxConst`),
      propMinConst: ShaderProperty.getByName(`renderer_${name}MinConst`),
      propMaxGradient: ShaderProperty.getByName(`renderer_${name}MaxGradient`),
      propMinGradient: ShaderProperty.getByName(`renderer_${name}MinGradient`)
    });
  }

  /**
   * Add a color gradient. Shader-side uniforms by `gradient.mode`:
   *
   * | Mode         | Uniforms                                                                                                              |
   * |--------------|-----------------------------------------------------------------------------------------------------------------------|
   * | Constant     | `vec4 renderer_<name>MaxConst`                                                                                        |
   * | TwoConstants | + `vec4 renderer_<name>MinConst`                                                                                      |
   * | Gradient     | `vec4 renderer_<name>MaxGradientColor[4]`, `vec2 renderer_<name>MaxGradientAlpha[4]`, `vec4 renderer_<name>KeysCount` |
   * | TwoGradients | + `vec4 renderer_<name>MinGradientColor[4]`, `vec2 renderer_<name>MinGradientAlpha[4]`                                |
   *
   * `KeysCount` packs `(colorMin, alphaMin, colorMax, alphaMax)` last-keyframe times for shader-side normalization;
   * in single-Gradient mode the min lanes mirror the max lanes.
   *
   * @param name     - Same validation as {@link addCurve}.
   * @param gradient - Stored by reference.
   */
  addGradient(name: string, gradient: ParticleCompositeGradient): void {
    if (!this._validateName(name, "addGradient")) {
      return;
    }
    this._gradients.set(name, gradient);
    this._gradientStreams.push({
      name,
      gradient,
      lastMode: gradient.mode,
      propMaxConst: ShaderProperty.getByName(`renderer_${name}MaxConst`),
      propMinConst: ShaderProperty.getByName(`renderer_${name}MinConst`),
      propMaxGradientColor: ShaderProperty.getByName(`renderer_${name}MaxGradientColor`),
      propMaxGradientAlpha: ShaderProperty.getByName(`renderer_${name}MaxGradientAlpha`),
      propMinGradientColor: ShaderProperty.getByName(`renderer_${name}MinGradientColor`),
      propMinGradientAlpha: ShaderProperty.getByName(`renderer_${name}MinGradientAlpha`),
      propKeysCount: ShaderProperty.getByName(`renderer_${name}KeysCount`),
      keysCountCache: new Vector4()
    });
  }

  /**
   * Remove a curve. Shader uniforms read 0 after removal.
   * @param name - The name passed to {@link addCurve}
   */
  removeCurve(name: string): void {
    const streams = this._curveStreams;
    let idx = -1;
    for (let i = 0, n = streams.length; i < n; i++) {
      if (streams[i].name === name) {
        idx = i;
        break;
      }
    }
    if (idx < 0) {
      return;
    }
    this._zeroCurveUniforms(this._generator._renderer.shaderData, streams[idx]);
    streams[idx] = streams[streams.length - 1];
    streams.pop();
    this._curves.delete(name);
  }

  /**
   * Remove a gradient. Shader uniforms read 0 after removal.
   * @param name - The name passed to {@link addGradient}
   */
  removeGradient(name: string): void {
    const streams = this._gradientStreams;
    let idx = -1;
    for (let i = 0, n = streams.length; i < n; i++) {
      if (streams[i].name === name) {
        idx = i;
        break;
      }
    }
    if (idx < 0) {
      return;
    }
    this._zeroGradientUniforms(this._generator._renderer.shaderData, streams[idx]);
    streams[idx] = streams[streams.length - 1];
    streams.pop();
    this._gradients.delete(name);
  }

  /**
   * @internal
   */
  _updateShaderData(shaderData: ShaderData): void {
    if (!this.enabled) {
      return;
    }
    const curveStreams = this._curveStreams;
    for (let i = 0, n = curveStreams.length; i < n; i++) {
      this._uploadCurveStream(shaderData, curveStreams[i]);
    }
    const gradientStreams = this._gradientStreams;
    for (let i = 0, n = gradientStreams.length; i < n; i++) {
      this._uploadGradientStream(shaderData, gradientStreams[i]);
    }
  }

  private _uploadCurveStream(shaderData: ShaderData, stream: CurveStream): void {
    const { curve } = stream;
    const mode = curve.mode;
    // Mode flip: clear the old path's uniforms so the GPU doesn't keep reading stale values.
    if (mode !== stream.lastMode) {
      this._zeroCurveUniforms(shaderData, stream);
      stream.lastMode = mode;
    }
    if (mode === ParticleCurveMode.Curve || mode === ParticleCurveMode.TwoCurves) {
      shaderData.setFloatArray(stream.propMaxGradient, curve.curveMax._getTypeArray());
      if (mode === ParticleCurveMode.TwoCurves) {
        shaderData.setFloatArray(stream.propMinGradient, curve.curveMin._getTypeArray());
      }
    } else {
      shaderData.setFloat(stream.propMaxConst, curve.constantMax);
      if (mode === ParticleCurveMode.TwoConstants) {
        shaderData.setFloat(stream.propMinConst, curve.constantMin);
      }
    }
  }

  private _uploadGradientStream(shaderData: ShaderData, stream: GradientStream): void {
    const { gradient } = stream;
    const mode = gradient.mode;
    if (mode !== stream.lastMode) {
      this._zeroGradientUniforms(shaderData, stream);
      stream.lastMode = mode;
    }

    if (mode === ParticleGradientMode.Gradient || mode === ParticleGradientMode.TwoGradients) {
      const gradientMax = gradient.gradientMax;
      shaderData.setFloatArray(stream.propMaxGradientColor, gradientMax._getColorTypeArray());
      shaderData.setFloatArray(stream.propMaxGradientAlpha, gradientMax._getAlphaTypeArray());

      const gradientMin = mode === ParticleGradientMode.TwoGradients ? gradient.gradientMin : gradientMax;
      if (mode === ParticleGradientMode.TwoGradients) {
        shaderData.setFloatArray(stream.propMinGradientColor, gradientMin._getColorTypeArray());
        shaderData.setFloatArray(stream.propMinGradientAlpha, gradientMin._getAlphaTypeArray());
      }

      const colorMinKeys = gradientMin.colorKeys;
      const alphaMinKeys = gradientMin.alphaKeys;
      const colorMaxKeys = gradientMax.colorKeys;
      const alphaMaxKeys = gradientMax.alphaKeys;
      stream.keysCountCache.set(
        colorMinKeys.length ? colorMinKeys[colorMinKeys.length - 1].time : 0,
        alphaMinKeys.length ? alphaMinKeys[alphaMinKeys.length - 1].time : 0,
        colorMaxKeys.length ? colorMaxKeys[colorMaxKeys.length - 1].time : 0,
        alphaMaxKeys.length ? alphaMaxKeys[alphaMaxKeys.length - 1].time : 0
      );
      shaderData.setVector4(stream.propKeysCount, stream.keysCountCache);
    } else {
      shaderData.setColor(stream.propMaxConst, gradient.constantMax);
      if (mode === ParticleGradientMode.TwoConstants) {
        shaderData.setColor(stream.propMinConst, gradient.constantMin);
      }
    }
  }

  private _zeroCurveUniforms(shaderData: ShaderData, stream: CurveStream): void {
    shaderData.setFloat(stream.propMaxConst, 0);
    shaderData.setFloat(stream.propMinConst, 0);
    shaderData.setFloatArray(stream.propMaxGradient, CustomDataModule._zeroCurveArray);
    shaderData.setFloatArray(stream.propMinGradient, CustomDataModule._zeroCurveArray);
  }

  private _zeroGradientUniforms(shaderData: ShaderData, stream: GradientStream): void {
    shaderData.setColor(stream.propMaxConst, CustomDataModule._zeroColor);
    shaderData.setColor(stream.propMinConst, CustomDataModule._zeroColor);
    shaderData.setFloatArray(stream.propMaxGradientColor, CustomDataModule._zeroGradientColorArray);
    shaderData.setFloatArray(stream.propMaxGradientAlpha, CustomDataModule._zeroGradientAlphaArray);
    shaderData.setFloatArray(stream.propMinGradientColor, CustomDataModule._zeroGradientColorArray);
    shaderData.setFloatArray(stream.propMinGradientAlpha, CustomDataModule._zeroGradientAlphaArray);
    shaderData.setVector4(stream.propKeysCount, CustomDataModule._zeroVector4);
  }

  private _validateName(name: string, method: string): boolean {
    if (!CustomDataModule._streamNamePattern.test(name)) {
      Logger.error(
        `CustomDataModule.${method}: "${name}" must contain only letters, digits, or underscores; call ignored.`
      );
      return false;
    }
    if (this._curves.has(name) || this._gradients.has(name)) {
      Logger.error(`CustomDataModule.${method}: "${name}" is already in use; call ignored.`);
      return false;
    }
    return true;
  }
}
