import { Color, Vector4 } from "@galacean/engine-math";
import { CloneManager, ignoreClone } from "../../clone/CloneManager";
import { Logger } from "../../base/Logger";
import { ShaderData } from "../../shader/ShaderData";
import { ShaderProperty } from "../../shader/ShaderProperty";
import { ParticleCurveMode } from "../enums/ParticleCurveMode";
import { ParticleGradientMode } from "../enums/ParticleGradientMode";
import { ParticleCompositeCurve } from "./ParticleCompositeCurve";
import { ParticleCompositeGradient } from "./ParticleCompositeGradient";
import { ParticleGeneratorModule } from "./ParticleGeneratorModule";

interface CurveStream {
  curve: ParticleCompositeCurve;
  lastMode: ParticleCurveMode;
  propMaxConst: ShaderProperty;
  propMinConst: ShaderProperty;
  propMaxGradient: ShaderProperty;
  propMinGradient: ShaderProperty;
}

interface GradientStream {
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
 * **Per-drawcall, not per-particle.** Each registered stream becomes one
 * uniform shared across every particle in the same drawcall — not a per-particle
 * vertex attribute. To differentiate between particles inside the shader, mix
 * the uniform with `a_Random*` / `normalizedAge` / etc. on the shader side.
 * This is NOT equivalent to Unity's `ParticleSystem.SetCustomParticleData`,
 * which uploads one vec4 per particle.
 *
 * **Attachment order.** When wiring this module on a freshly created entity,
 * configure the generator (set the material's custom shader, call `addCurve` /
 * `addGradient`) BEFORE attaching the entity to the scene. `ParticleRenderer`'s
 * `_onEnable` lifecycle hook fires as soon as the entity joins the scene tree;
 * streams registered afterward will miss the first frame.
 */
export class CustomDataModule extends ParticleGeneratorModule {
  private static readonly _streamNamePattern = /^[A-Za-z0-9_]+$/;
  // Engine-internal particle module uniform prefixes: VOL/FOL/SOL/COL/ROL/TSA/LVL.
  // A user `name` starting with any of these would generate a `renderer_<name>...`
  // uniform that collides with an existing engine uniform in the same ShaderData slot.
  private static readonly _reservedPrefixPattern = /^(?:VOL|FOL|SOL|COL|ROL|TSA|LVL)/;
  private static readonly _zeroCurveArray = new Float32Array(8);
  private static readonly _zeroGradientColorArray = new Float32Array(16);
  private static readonly _zeroGradientAlphaArray = new Float32Array(8);
  private static readonly _zeroColor = new Color(0, 0, 0, 0);
  private static readonly _zeroVector4 = new Vector4(0, 0, 0, 0);

  @ignoreClone
  private _curves: Map<string, ParticleCompositeCurve> = new Map();
  @ignoreClone
  private _gradients: Map<string, ParticleCompositeGradient> = new Map();

  @ignoreClone
  private _curveStreams: Map<string, CurveStream> = new Map();
  @ignoreClone
  private _gradientStreams: Map<string, GradientStream> = new Map();

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
    this._curveStreams.set(name, {
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
   * `KeysCount` packs the last keyframe times the shader needs to normalize
   * its sample t: `(colorMinKeys.last.time, alphaMinKeys.last.time, colorMaxKeys.last.time, alphaMaxKeys.last.time)`.
   * In single-Gradient mode the min channels mirror the max channels.
   *
   * @param name     - Same validation as {@link addCurve}.
   * @param gradient - Stored by reference.
   */
  addGradient(name: string, gradient: ParticleCompositeGradient): void {
    if (!this._validateName(name, "addGradient")) {
      return;
    }
    this._gradients.set(name, gradient);
    this._gradientStreams.set(name, {
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
    const stream = this._curveStreams.get(name);
    if (!stream) {
      return;
    }
    this._zeroCurveUniforms(this._generator._renderer.shaderData, stream);
    this._curveStreams.delete(name);
    this._curves.delete(name);
  }

  /**
   * Remove a gradient. Shader uniforms read 0 after removal.
   * @param name - The name passed to {@link addGradient}
   */
  removeGradient(name: string): void {
    const stream = this._gradientStreams.get(name);
    if (!stream) {
      return;
    }
    this._zeroGradientUniforms(this._generator._renderer.shaderData, stream);
    this._gradientStreams.delete(name);
    this._gradients.delete(name);
  }

  /**
   * @internal
   */
  _cloneTo(target: CustomDataModule): void {
    // Share one deep-instance map across both loops so that a sub-object
    // referenced by multiple entries (e.g. two curves whose `curveMax` points
    // to the same ParticleCurve instance) stays shared in the clone, instead
    // of being deep-copied once per entry.
    const deepInstanceMap = new Map<Object, Object>();
    for (const [name, curve] of this._curves) {
      const clonedCurve = new ParticleCompositeCurve(0);
      CloneManager.deepCloneObject(curve, clonedCurve, deepInstanceMap);
      target.addCurve(name, clonedCurve);
    }
    for (const [name, gradient] of this._gradients) {
      const clonedGradient = new ParticleCompositeGradient(new Color());
      CloneManager.deepCloneObject(gradient, clonedGradient, deepInstanceMap);
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
    for (const stream of this._curveStreams.values()) {
      this._uploadCurveStream(shaderData, stream);
    }
    for (const stream of this._gradientStreams.values()) {
      this._uploadGradientStream(shaderData, stream);
    }
  }

  private _uploadCurveStream(shaderData: ShaderData, stream: CurveStream): void {
    const { curve } = stream;
    const mode = curve.mode;
    // On mode change, zero the uniforms the old mode wrote so the GPU doesn't
    // keep reading stale values from the unused mode path.
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
    if (CustomDataModule._reservedPrefixPattern.test(name)) {
      Logger.error(
        `CustomDataModule.${method}: "${name}" starts with a reserved engine particle module prefix ` +
          `(VOL/FOL/SOL/COL/ROL/TSA/LVL) and would collide with built-in uniforms; call ignored.`
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
