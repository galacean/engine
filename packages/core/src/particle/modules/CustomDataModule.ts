import { Vector4 } from "@galacean/engine-math";
import { ignoreClone } from "../../clone/CloneManager";
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
 * (scalars or colors) readable from a custom particle shader via plain
 * uniforms following the `renderer_<Name><Suffix>` naming convention.
 *
 * Users declare the matching uniforms in their custom shader source and sample
 * them with the engine's existing GLSL helpers (`mix`, `evaluateParticleCurve`,
 * `evaluateParticleGradient`, `_particleRand`). See the docs on
 * {@link addCurve} and {@link addGradient} for the suffix tables.
 */
export class CustomDataModule extends ParticleGeneratorModule {
  /**
   * Registered scalar streams keyed by user-provided name. Mutate values in
   * place (e.g. `customData.curves["Intensity"].constantMax = 0.8`); add or
   * remove entries via {@link addCurve} / {@link removeCurve}.
   */
  readonly curves: Record<string, ParticleCompositeCurve> = {};

  /**
   * Registered color streams keyed by user-provided name. Mutate values in
   * place; add or remove entries via {@link addGradient} / {@link removeGradient}.
   */
  readonly gradients: Record<string, ParticleCompositeGradient> = {};

  @ignoreClone
  private _curveStreams: Record<string, CurveStreamMeta> = {};
  @ignoreClone
  private _gradientStreams: Record<string, GradientStreamMeta> = {};

  constructor(generator: ParticleGenerator) {
    super(generator);
  }

  /**
   * Register a scalar stream. The shader-side uniforms the user must declare
   * depend on `curve.mode`:
   *
   * | Mode         | Uniforms                                                                       |
   * |--------------|--------------------------------------------------------------------------------|
   * | Constant     | `float renderer_<name>MaxConst`                                                |
   * | TwoConstants | `float renderer_<name>MaxConst`, `float renderer_<name>MinConst`               |
   * | Curve        | `vec2 renderer_<name>MaxGradient[4]`                                           |
   * | TwoCurves    | `vec2 renderer_<name>MaxGradient[4]`, `vec2 renderer_<name>MinGradient[4]`     |
   *
   * @param name  - Used verbatim in uniform names. Must be a valid GLSL
   *                identifier; must not already be used by `curves` or
   *                `gradients`. Invalid names log a `Logger.error` and the
   *                call is a no-op.
   * @param curve - Stored by reference; mutate via `customData.curves[name]`.
   */
  addCurve(name: string, curve: ParticleCompositeCurve): void {
    if (!this._validateName(name, "addCurve")) {
      return;
    }
    this.curves[name] = curve;
    this._curveStreams[name] = {
      curve,
      propMaxConst: ShaderProperty.getByName(`renderer_${name}MaxConst`),
      propMinConst: ShaderProperty.getByName(`renderer_${name}MinConst`),
      propMaxGradient: ShaderProperty.getByName(`renderer_${name}MaxGradient`),
      propMinGradient: ShaderProperty.getByName(`renderer_${name}MinGradient`)
    };
  }

  /**
   * Register a color stream. The shader-side uniforms the user must declare
   * depend on `gradient.mode`. Only `Constant` and `TwoConstants` modes are
   * supported in this version; gradient-keyed color animation
   * (`Gradient` / `TwoGradients`) lands in a follow-up PR.
   *
   * | Mode         | Uniforms                                                       |
   * |--------------|----------------------------------------------------------------|
   * | Constant     | `vec4 renderer_<name>MaxConst`                                 |
   * | TwoConstants | `vec4 renderer_<name>MaxConst`, `vec4 renderer_<name>MinConst` |
   *
   * @param name     - Used verbatim in uniform names. Same validation as {@link addCurve}.
   * @param gradient - Stored by reference; mutate via `customData.gradients[name]`.
   */
  addGradient(name: string, gradient: ParticleCompositeGradient): void {
    if (!this._validateName(name, "addGradient")) {
      return;
    }
    this.gradients[name] = gradient;
    this._gradientStreams[name] = {
      gradient,
      propMaxConst: ShaderProperty.getByName(`renderer_${name}MaxConst`),
      propMinConst: ShaderProperty.getByName(`renderer_${name}MinConst`),
      maxColorCache: new Vector4(),
      minColorCache: new Vector4()
    };
  }

  /**
   * Unregister a scalar stream. Custom shaders still referencing the matching
   * `renderer_<name>...` uniforms will read 0 (the GLSL default for unset
   * uniforms) — the user is responsible for keeping shader source in sync.
   */
  removeCurve(name: string): void {
    if (!(name in this._curveStreams)) {
      return;
    }
    delete this._curveStreams[name];
    delete this.curves[name];
  }

  /**
   * Unregister a color stream. See {@link removeCurve} for the shader caveat.
   */
  removeGradient(name: string): void {
    if (!(name in this._gradientStreams)) {
      return;
    }
    delete this._gradientStreams[name];
    delete this.gradients[name];
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
      this._uploadGradientStream(shaderData, this._gradientStreams[name]);
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

  private _uploadGradientStream(shaderData: ShaderData, meta: GradientStreamMeta): void {
    const { gradient } = meta;
    const mode = gradient.mode;

    if (mode === ParticleGradientMode.Constant || mode === ParticleGradientMode.TwoConstants) {
      const max = gradient.constantMax;
      meta.maxColorCache.set(max.r, max.g, max.b, max.a);
      shaderData.setVector4(meta.propMaxConst, meta.maxColorCache);
      if (mode === ParticleGradientMode.TwoConstants) {
        const min = gradient.constantMin;
        meta.minColorCache.set(min.r, min.g, min.b, min.a);
        shaderData.setVector4(meta.propMinConst, meta.minColorCache);
      }
    }
    // Gradient / TwoGradients: no GPU upload in this version; follow-up PR.
  }

  private _validateName(name: string, method: string): boolean {
    if (!STREAM_NAME_PATTERN.test(name)) {
      Logger.error(
        `CustomDataModule.${method}: "${name}" is not a valid GLSL identifier ` +
          `([A-Za-z_][A-Za-z0-9_]*); call ignored.`
      );
      return false;
    }
    if (name in this.curves || name in this.gradients) {
      Logger.error(`CustomDataModule.${method}: stream "${name}" is already registered; call ignored.`);
      return false;
    }
    return true;
  }
}
