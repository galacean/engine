import { Vector4 } from "@galacean/engine-math";
import { ignoreClone } from "../../clone/CloneManager";
import { Shader } from "../../shader/Shader";
import { ShaderLanguage } from "../../shader/enums/ShaderLanguage";
import { ShaderData } from "../../shader/ShaderData";
import { ShaderFactory } from "../../shader/ShaderFactory";
import { ShaderMacro } from "../../shader/ShaderMacro";
import { ShaderProperty } from "../../shader/ShaderProperty";
import { ParticleCurveMode } from "../enums/ParticleCurveMode";
import { ParticleGradientMode } from "../enums/ParticleGradientMode";
import { ParticleGenerator } from "../ParticleGenerator";
import { ParticleCompositeCurve } from "./ParticleCompositeCurve";
import { ParticleCompositeGradient } from "./ParticleCompositeGradient";
import { ParticleGeneratorModule } from "./ParticleGeneratorModule";

const CUSTOM_DATA_INCLUDE_PATH = "ShaderLibrary/Particle/Module/CustomData.glsl";
const STREAM_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

interface CurveStreamMeta {
  curve: ParticleCompositeCurve;
  uniformName: string;
  macroConstant: ShaderMacro;
  macroCurve: ShaderMacro;
  macroTwo: ShaderMacro;
  propMaxConst: ShaderProperty;
  propMinConst: ShaderProperty;
  propMaxGradient: ShaderProperty;
  propMinGradient: ShaderProperty;
  seed: number;
  lastModeMacro: ShaderMacro;
  lastTwoMacro: ShaderMacro;
}

interface GradientStreamMeta {
  gradient: ParticleCompositeGradient;
  uniformName: string;
  macroConstant: ShaderMacro;
  macroTwo: ShaderMacro;
  propMaxConst: ShaderProperty;
  propMinConst: ShaderProperty;
  maxColorCache: Vector4;
  minColorCache: Vector4;
  seed: number;
  lastModeMacro: ShaderMacro;
  lastTwoMacro: ShaderMacro;
}

/**
 * Custom data module — exposes per-particle data streams readable from a
 * custom particle shader. Each stream is either a scalar `ParticleCompositeCurve`
 * (registered via {@link addCurve}) or a `ParticleCompositeGradient` color
 * (registered via {@link addGradient}). Streams are sampled in the shader as
 * `sampleParticleCustom_<Name>(attr, normalizedAge)` (returning `float` or
 * `vec4`); the helper bodies are generated and inlined when the shader is
 * built via {@link createParticleShader}.
 */
export class CustomDataModule extends ParticleGeneratorModule {
  /**
   * Registered scalar streams keyed by user-provided name. Mutate values in
   * place (e.g. `customData.curves["intensity"].constantMax = 0.8`); add or
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
   * Register a scalar stream readable from a custom shader as
   * `float sampleParticleCustom_<Name>(Attributes attr, float normalizedAge)`.
   * @param name - GLSL-safe identifier (matches `[A-Za-z_][A-Za-z0-9_]*`).
   * @param curve - The curve value. Stored by reference; mutate via
   *                `customData.curves[name]` afterwards.
   * @returns `false` if name is invalid or already used (in either curves or
   *          gradients); `true` on success.
   */
  addCurve(name: string, curve: ParticleCompositeCurve): boolean {
    if (!this._isNameAvailable(name)) {
      return false;
    }
    const uniformName = CustomDataModule._toPascalCase(name);
    const upper = CustomDataModule._toUpper(name);
    this.curves[name] = curve;
    this._curveStreams[name] = {
      curve,
      uniformName,
      macroConstant: ShaderMacro.getByName(`RENDERER_CUSTOM_${upper}_CONSTANT_MODE`),
      macroCurve: ShaderMacro.getByName(`RENDERER_CUSTOM_${upper}_CURVE_MODE`),
      macroTwo: ShaderMacro.getByName(`RENDERER_CUSTOM_${upper}_IS_RANDOM_TWO`),
      propMaxConst: ShaderProperty.getByName(`renderer_${uniformName}MaxConst`),
      propMinConst: ShaderProperty.getByName(`renderer_${uniformName}MinConst`),
      propMaxGradient: ShaderProperty.getByName(`renderer_${uniformName}MaxGradient`),
      propMinGradient: ShaderProperty.getByName(`renderer_${uniformName}MinGradient`),
      seed: CustomDataModule._hashName(name),
      lastModeMacro: null,
      lastTwoMacro: null
    };
    return true;
  }

  /**
   * Register a color stream readable from a custom shader as
   * `vec4 sampleParticleCustom_<Name>(Attributes attr, float normalizedAge)`.
   * Only `Constant` and `TwoConstants` modes are supported; gradient-keyed
   * color animation is not yet implemented in the GPU helper.
   * @returns `false` if name is invalid or already used; `true` on success.
   */
  addGradient(name: string, gradient: ParticleCompositeGradient): boolean {
    if (!this._isNameAvailable(name)) {
      return false;
    }
    const uniformName = CustomDataModule._toPascalCase(name);
    const upper = CustomDataModule._toUpper(name);
    this.gradients[name] = gradient;
    this._gradientStreams[name] = {
      gradient,
      uniformName,
      macroConstant: ShaderMacro.getByName(`RENDERER_CUSTOM_${upper}_CONSTANT_MODE`),
      macroTwo: ShaderMacro.getByName(`RENDERER_CUSTOM_${upper}_IS_RANDOM_TWO`),
      propMaxConst: ShaderProperty.getByName(`renderer_${uniformName}MaxConst`),
      propMinConst: ShaderProperty.getByName(`renderer_${uniformName}MinConst`),
      maxColorCache: new Vector4(),
      minColorCache: new Vector4(),
      seed: CustomDataModule._hashName(name),
      lastModeMacro: null,
      lastTwoMacro: null
    };
    return true;
  }

  /**
   * Unregister a scalar stream. Existing shaders that reference the helper
   * will read the default uniform value (0); to fully remove the GLSL helper
   * the user must rebuild the shader via {@link createParticleShader}.
   * @returns `false` if the stream wasn't registered.
   */
  removeCurve(name: string): boolean {
    const meta = this._curveStreams[name];
    if (!meta) return false;
    const shaderData = this._generator._renderer.shaderData;
    meta.lastModeMacro && shaderData.disableMacro(meta.lastModeMacro);
    meta.lastTwoMacro && shaderData.disableMacro(meta.lastTwoMacro);
    delete this._curveStreams[name];
    delete this.curves[name];
    return true;
  }

  /**
   * Unregister a color stream. See {@link removeCurve} for the shader caveat.
   */
  removeGradient(name: string): boolean {
    const meta = this._gradientStreams[name];
    if (!meta) return false;
    const shaderData = this._generator._renderer.shaderData;
    meta.lastModeMacro && shaderData.disableMacro(meta.lastModeMacro);
    meta.lastTwoMacro && shaderData.disableMacro(meta.lastTwoMacro);
    delete this._gradientStreams[name];
    delete this.gradients[name];
    return true;
  }

  /**
   * @internal
   * Used by {@link ParticleRenderer.createCustomShader}. Snapshots the
   * current streams into a generated GLSL chunk, temporarily replaces the
   * `ShaderLibrary/Particle/Module/CustomData.glsl` include, calls
   * `Shader.create`, then restores the include map.
   */
  _createShader(shaderSource: string, platformTarget?: ShaderLanguage, path?: string): Shader {
    const generated = this._buildIncludeSource();
    const original = ShaderFactory.includeMap[CUSTOM_DATA_INCLUDE_PATH];
    if (original !== undefined) {
      ShaderFactory.unRegisterInclude(CUSTOM_DATA_INCLUDE_PATH);
    }
    ShaderFactory.registerInclude(CUSTOM_DATA_INCLUDE_PATH, generated);
    try {
      return Shader.create(shaderSource, platformTarget, path);
    } finally {
      ShaderFactory.unRegisterInclude(CUSTOM_DATA_INCLUDE_PATH);
      if (original !== undefined) {
        ShaderFactory.registerInclude(CUSTOM_DATA_INCLUDE_PATH, original);
      }
    }
  }

  /**
   * @internal
   */
  _updateShaderData(shaderData: ShaderData): void {
    if (this.enabled) {
      for (const name in this._curveStreams) {
        this._uploadCurveStream(shaderData, this._curveStreams[name]);
      }
      for (const name in this._gradientStreams) {
        this._uploadGradientStream(shaderData, this._gradientStreams[name]);
      }
    } else {
      for (const name in this._curveStreams) {
        this._disableCurveStream(shaderData, this._curveStreams[name]);
      }
      for (const name in this._gradientStreams) {
        this._disableGradientStream(shaderData, this._gradientStreams[name]);
      }
    }
  }

  private _uploadCurveStream(shaderData: ShaderData, meta: CurveStreamMeta): void {
    const { curve } = meta;
    const mode = curve.mode;
    let modeMacro: ShaderMacro = null;
    let twoMacro: ShaderMacro = null;

    if (mode === ParticleCurveMode.Curve || mode === ParticleCurveMode.TwoCurves) {
      shaderData.setFloatArray(meta.propMaxGradient, curve.curveMax._getTypeArray());
      if (mode === ParticleCurveMode.TwoCurves) {
        shaderData.setFloatArray(meta.propMinGradient, curve.curveMin._getTypeArray());
        twoMacro = meta.macroTwo;
      }
      modeMacro = meta.macroCurve;
    } else {
      shaderData.setFloat(meta.propMaxConst, curve.constantMax);
      if (mode === ParticleCurveMode.TwoConstants) {
        shaderData.setFloat(meta.propMinConst, curve.constantMin);
        twoMacro = meta.macroTwo;
      }
      modeMacro = meta.macroConstant;
    }

    meta.lastModeMacro = this._enableMacro(shaderData, meta.lastModeMacro, modeMacro);
    meta.lastTwoMacro = this._enableMacro(shaderData, meta.lastTwoMacro, twoMacro);
  }

  private _disableCurveStream(shaderData: ShaderData, meta: CurveStreamMeta): void {
    meta.lastModeMacro = this._enableMacro(shaderData, meta.lastModeMacro, null);
    meta.lastTwoMacro = this._enableMacro(shaderData, meta.lastTwoMacro, null);
  }

  private _uploadGradientStream(shaderData: ShaderData, meta: GradientStreamMeta): void {
    const { gradient } = meta;
    const mode = gradient.mode;
    let modeMacro: ShaderMacro = null;
    let twoMacro: ShaderMacro = null;

    if (mode === ParticleGradientMode.Constant || mode === ParticleGradientMode.TwoConstants) {
      const max = gradient.constantMax;
      meta.maxColorCache.set(max.r, max.g, max.b, max.a);
      shaderData.setVector4(meta.propMaxConst, meta.maxColorCache);
      if (mode === ParticleGradientMode.TwoConstants) {
        const min = gradient.constantMin;
        meta.minColorCache.set(min.r, min.g, min.b, min.a);
        shaderData.setVector4(meta.propMinConst, meta.minColorCache);
        twoMacro = meta.macroTwo;
      }
      modeMacro = meta.macroConstant;
    }
    // Gradient / TwoGradients: not yet supported in GPU helper — leave macros off.

    meta.lastModeMacro = this._enableMacro(shaderData, meta.lastModeMacro, modeMacro);
    meta.lastTwoMacro = this._enableMacro(shaderData, meta.lastTwoMacro, twoMacro);
  }

  private _disableGradientStream(shaderData: ShaderData, meta: GradientStreamMeta): void {
    meta.lastModeMacro = this._enableMacro(shaderData, meta.lastModeMacro, null);
    meta.lastTwoMacro = this._enableMacro(shaderData, meta.lastTwoMacro, null);
  }

  private _isNameAvailable(name: string): boolean {
    if (!STREAM_NAME_PATTERN.test(name)) return false;
    return !(name in this.curves) && !(name in this.gradients);
  }

  private _buildIncludeSource(): string {
    const parts: string[] = [
      "#ifndef CUSTOM_DATA_INCLUDED",
      "#define CUSTOM_DATA_INCLUDED",
      "",
      "// Deterministic per-particle random in [0, 1) hashed from birthTime + a_Random0.",
      "// Mixing a_Random0.x avoids the sin(0)=0 degenerate at birthTime=0.",
      "vec4 _customDataParticleRand(Attributes attr, float seed) {",
      "    vec4 k = vec4(12.9898, 78.233, 39.346, 11.135) + vec4(seed);",
      "    return fract(sin((attr.a_DirectionTime.w + attr.a_Random0.x) * k) * 43758.5453);",
      "}",
      ""
    ];
    for (const name in this._curveStreams) {
      parts.push(this._buildCurveHelper(this._curveStreams[name]));
    }
    for (const name in this._gradientStreams) {
      parts.push(this._buildGradientHelper(this._gradientStreams[name]));
    }
    parts.push("#endif");
    return parts.join("\n");
  }

  private _buildCurveHelper(meta: CurveStreamMeta): string {
    const upper = `RENDERER_CUSTOM_${CustomDataModule._toUpper(meta.uniformName)}`;
    const uMaxConst = `renderer_${meta.uniformName}MaxConst`;
    const uMinConst = `renderer_${meta.uniformName}MinConst`;
    const uMaxGrad = `renderer_${meta.uniformName}MaxGradient`;
    const uMinGrad = `renderer_${meta.uniformName}MinGradient`;
    const seed = meta.seed.toFixed(1);
    return [
      `#ifdef ${upper}_CONSTANT_MODE`,
      `    float ${uMaxConst};`,
      `    #ifdef ${upper}_IS_RANDOM_TWO`,
      `        float ${uMinConst};`,
      `    #endif`,
      `#endif`,
      `#ifdef ${upper}_CURVE_MODE`,
      `    vec2 ${uMaxGrad}[4];`,
      `    #ifdef ${upper}_IS_RANDOM_TWO`,
      `        vec2 ${uMinGrad}[4];`,
      `    #endif`,
      `#endif`,
      `float sampleParticleCustom_${meta.uniformName}(Attributes attr, float normalizedAge) {`,
      `    #ifdef ${upper}_CONSTANT_MODE`,
      `        float value = ${uMaxConst};`,
      `        #ifdef ${upper}_IS_RANDOM_TWO`,
      `            float r = _customDataParticleRand(attr, ${seed}).x;`,
      `            value = mix(${uMinConst}, value, r);`,
      `        #endif`,
      `        return value;`,
      `    #endif`,
      `    #ifdef ${upper}_CURVE_MODE`,
      `        float value = evaluateParticleCurve(${uMaxGrad}, normalizedAge);`,
      `        #ifdef ${upper}_IS_RANDOM_TWO`,
      `            float minValue = evaluateParticleCurve(${uMinGrad}, normalizedAge);`,
      `            float r = _customDataParticleRand(attr, ${seed}).x;`,
      `            value = mix(minValue, value, r);`,
      `        #endif`,
      `        return value;`,
      `    #endif`,
      `    return 0.0;`,
      `}`,
      ``
    ].join("\n");
  }

  private _buildGradientHelper(meta: GradientStreamMeta): string {
    const upper = `RENDERER_CUSTOM_${CustomDataModule._toUpper(meta.uniformName)}`;
    const uMaxConst = `renderer_${meta.uniformName}MaxConst`;
    const uMinConst = `renderer_${meta.uniformName}MinConst`;
    const seed = meta.seed.toFixed(1);
    return [
      `#ifdef ${upper}_CONSTANT_MODE`,
      `    vec4 ${uMaxConst};`,
      `    #ifdef ${upper}_IS_RANDOM_TWO`,
      `        vec4 ${uMinConst};`,
      `    #endif`,
      `#endif`,
      `vec4 sampleParticleCustom_${meta.uniformName}(Attributes attr, float normalizedAge) {`,
      `    #ifdef ${upper}_CONSTANT_MODE`,
      `        vec4 value = ${uMaxConst};`,
      `        #ifdef ${upper}_IS_RANDOM_TWO`,
      `            vec4 r = _customDataParticleRand(attr, ${seed});`,
      `            value = mix(${uMinConst}, value, r);`,
      `        #endif`,
      `        return value;`,
      `    #endif`,
      `    return vec4(0.0);`,
      `}`,
      ``
    ].join("\n");
  }

  private static _toPascalCase(name: string): string {
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  private static _toUpper(name: string): string {
    // ASCII-only names (guaranteed by STREAM_NAME_PATTERN) — uppercase is identity-safe.
    return name.toUpperCase();
  }

  private static _hashName(name: string): number {
    // FNV-1a 32-bit hash, then map to [1, 65536) so the float seed stays in a
    // numerically stable range for sin() hashing in the shader.
    let h = 2166136261;
    for (let i = 0; i < name.length; i++) {
      h ^= name.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ((h >>> 16) % 65535) + 1;
  }
}
