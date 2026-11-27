import { Color, MathUtil, Vector3 } from "@galacean/engine-math";
import type { Camera } from "../../Camera";
import type { Engine } from "../../Engine";
import { EngineEventType } from "../../EngineEventType";
import { Buffer } from "../../graphic/Buffer";
import { BufferBindFlag } from "../../graphic/enums/BufferBindFlag";
import { BufferUsage } from "../../graphic/enums/BufferUsage";
import { MeshTopology } from "../../graphic/enums/MeshTopology";
import type { IndexBufferBinding } from "../../graphic/IndexBufferBinding";
import { Primitive } from "../../graphic/Primitive";
import { TransformFeedbackSimulator } from "../../graphic/TransformFeedbackSimulator";
import { VertexBufferBinding } from "../../graphic/VertexBufferBinding";
import { VertexElement } from "../../graphic/VertexElement";
import { VertexElementFormat } from "../../graphic/enums/VertexElementFormat";
import type { Scene } from "../../Scene";
import { ComputeShader, ShaderData, ShaderMacro, ShaderProperty } from "../../shader";
import type { ShaderPass } from "../../shader/ShaderPass";
import { PostProcessEffect } from "../PostProcessEffect";
import {
  PostProcessEffectBoolParameter,
  PostProcessEffectColorParameter,
  PostProcessEffectFloatParameter,
  PostProcessEffectVector3Parameter
} from "../PostProcessEffectParameter";

export interface SunLensFlareScreenState {
  visible: boolean;
  sunU: number;
  sunV: number;
  effectiveIntensity: number;
  aspectRatio: number;
}

const SUN_LENS_FLARE_TEMP = {
  dirToSun: new Vector3(),
  viewDir: new Vector3()
};

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = MathUtil.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Procedural screen-space sun glare and circular/polygonal lens ghosting executed by the Uber pass.
 */
export class SunLensFlareEffect extends PostProcessEffect {
  /** @internal */
  static readonly _shaderName = "PostProcess/SunLensFlare";
  /** @internal */
  static readonly _visibilityShaderName = "PostProcess/SunLensFlareVisibility";
  /** @internal */
  static _enableMacro: ShaderMacro = ShaderMacro.getByName("ENABLE_EFFECT_SUN_LENS_FLARE");
  /** @internal */
  static _textureProperty: ShaderProperty = ShaderProperty.getByName("material_SunLensFlareTexture");
  /** @internal */
  static _compositeIntensityProperty: ShaderProperty = ShaderProperty.getByName(
    "material_SunLensFlareCompositeIntensity"
  );
  /** @internal */
  static _params0Property: ShaderProperty = ShaderProperty.getByName("material_SunLensFlareParams0");
  /** @internal */
  static _params1Property: ShaderProperty = ShaderProperty.getByName("material_SunLensFlareParams1");
  /** @internal */
  static _tintProperty: ShaderProperty = ShaderProperty.getByName("material_SunLensFlareTint");
  /** @internal */
  static _visibilityOverrideProperty: ShaderProperty = ShaderProperty.getByName(
    "material_SunLensFlareVisibilityOverride"
  );
  /** @internal */
  static _tfDepthTextureProperty: ShaderProperty = ShaderProperty.getByName("renderer_SunLensFlareDepthTexture");
  /** @internal */
  static _tfDepthRectProperty: ShaderProperty = ShaderProperty.getByName("renderer_SunLensFlareDepthRect");
  /** @internal */
  static _tfParams0Property: ShaderProperty = ShaderProperty.getByName("renderer_SunLensFlareVisibilityParams0");
  /** @internal */
  static _tfParams1Property: ShaderProperty = ShaderProperty.getByName("renderer_SunLensFlareVisibilityParams1");

  /** Overall linear HDR intensity multiplier. Zero disables rendering. */
  intensity = new PostProcessEffectFloatParameter(0.85, 0, 4);
  /** Multiplier for the sun core glow and starburst frills. */
  glareIntensity = new PostProcessEffectFloatParameter(0.75, 0, 4);
  /** Multiplier for the circular, pinpoint, and hexagonal optical-axis ghosts. */
  ghostIntensity = new PostProcessEffectFloatParameter(1.2, 0, 4);
  /** Scale of ghost spread along the sun-to-center optical axis. */
  ghostSpread = new PostProcessEffectFloatParameter(1, 0.25, 2.5);
  /** Saturation of spectral rainbow dispersion on lens ghosts (0 = sun tint, 1 = full chromatic). */
  ghostChromaticity = new PostProcessEffectFloatParameter(0.8, 0, 1);
  /** Linear RGB tint multiplied onto glare and ghosts. */
  tint = new PostProcessEffectColorParameter(new Color(1, 0.94, 0.84, 1));
  /** Sample camera depth around the solar disk to occlude the flare behind scene geometry. */
  depthOcclusion = new PostProcessEffectBoolParameter(true);
  /**
   * GPU 1x1 temporal smoothing time constant in seconds for occlusion visibility (0 disables smoothing).
   * Damps rapid flickering when the sun passes behind tree canopy foliage.
   */
  temporalSmoothing = new PostProcessEffectFloatParameter(0.08, 0, 0.5);
  /**
   * Optional light propagation direction (pointing from sun toward ground, matching `DirectLight.direction`).
   * When left at `(0, 0, 0)`, the active `scene.sun` direction is used automatically.
   */
  sunDirectionOverride = new PostProcessEffectVector3Parameter(new Vector3(0, 0, 0), false);

  /** @inheritdoc */
  override isValid(): boolean {
    return this.enabled;
  }

  /**
   * Resolves the projected sun UV and attenuated flare intensity for the active camera.
   * @internal
   */
  static _resolveScreenState(
    camera: Camera,
    scene: Scene,
    effect: SunLensFlareEffect,
    out: SunLensFlareScreenState
  ): SunLensFlareScreenState {
    out.visible = false;
    out.sunU = 0.5;
    out.sunV = 0.5;
    out.effectiveIntensity = 0;
    out.aspectRatio = Math.max(camera.aspectRatio, 1e-4);

    if (!effect.isValid() || effect.intensity.value <= 0 || camera.isOrthographic) {
      return out;
    }

    const dirToSun = SUN_LENS_FLARE_TEMP.dirToSun;
    const overrideDir = effect.sunDirectionOverride.value;
    const overrideLenSq = overrideDir.lengthSquared();
    if (overrideLenSq > 1e-6) {
      const invLen = -1 / Math.sqrt(overrideLenSq);
      dirToSun.set(overrideDir.x * invLen, overrideDir.y * invLen, overrideDir.z * invLen);
    } else {
      const sunlight = scene._lightManager._sunlight ?? scene.sun;
      if (!sunlight) {
        return out;
      }
      const reverseDir = sunlight.reverseDirection;
      const lenSq = reverseDir.lengthSquared();
      if (lenSq <= 1e-6) {
        return out;
      }
      const invLen = 1 / Math.sqrt(lenSq);
      dirToSun.set(reverseDir.x * invLen, reverseDir.y * invLen, reverseDir.z * invLen);
    }

    // Fade smoothly as the sun approaches and dips below the horizon.
    const horizonFade = smoothstep(-0.02, 0.08, dirToSun.y);
    if (horizonFade <= 1e-4) {
      return out;
    }

    // Transform the infinite sun direction into camera view space (camera looks down -Z).
    const viewDir = SUN_LENS_FLARE_TEMP.viewDir;
    Vector3.transformNormal(dirToSun, camera.viewMatrix, viewDir);
    const forwardDot = -viewDir.z;
    if (forwardDot <= 1e-3) {
      return out;
    }

    const p = camera.projectionMatrix.elements;
    const vx = viewDir.x;
    const vy = viewDir.y;
    const vz = viewDir.z;
    const clipX = p[0] * vx + p[4] * vy + p[8] * vz;
    const clipY = p[1] * vx + p[5] * vy + p[9] * vz;
    const clipW = p[3] * vx + p[7] * vy + p[11] * vz;
    if (clipW <= 1e-4) {
      return out;
    }

    const sunU = (clipX / clipW + 1) * 0.5;
    const sunV = (1 - clipY / clipW) * 0.5;
    const edgeDist = Math.max(Math.abs(sunU - 0.5), Math.abs(sunV - 0.5));
    // Keep full intensity inside the viewport and taper softly past the frame border so ghosts sweep smoothly.
    const edgeFade = 1 - smoothstep(0.48, 0.88, edgeDist);
    const forwardFade = smoothstep(0.05, 0.25, forwardDot);
    const effectiveIntensity = effect.intensity.value * horizonFade * edgeFade * forwardFade;

    if (effectiveIntensity <= 1e-4) {
      return out;
    }

    out.visible = true;
    out.sunU = sunU;
    out.sunV = sunV;
    out.effectiveIntensity = effectiveIntensity;
    return out;
  }
}

const SUN_LENS_FLARE_VISIBILITY_COMPUTE_NAME = "PostProcess/SunLensFlareVisibilityCompute";

const sunLensFlareComputeCache = new WeakMap<Engine, ComputeShader>();

function getOrCreateVisibilityComputeShader(engine: Engine): ComputeShader {
  let cs = sunLensFlareComputeCache.get(engine);
  if (!cs || cs.destroyed) {
    const precompiled = engine._builtinShaders.computeByName[SUN_LENS_FLARE_VISIBILITY_COMPUTE_NAME];
    if (!precompiled) {
      throw new Error(`Built-in ComputeShader "${SUN_LENS_FLARE_VISIBILITY_COMPUTE_NAME}" is not registered.`);
    }
    cs = ComputeShader.createFromPrecompiled(precompiled, engine);
    sunLensFlareComputeCache.set(engine, cs);
    engine.once(EngineEventType.Shutdown, () => {
      if (sunLensFlareComputeCache.get(engine) === cs) {
        sunLensFlareComputeCache.delete(engine);
      }
      cs!.destroy();
    });
  }
  return cs;
}

/**
 * Camera-scoped temporal occlusion state and GPU resources owned by `BasicRenderPipeline`.
 * Selects native `ComputeShader` on WebGPU or Transform Feedback on WebGL2, keeping per-camera
 * ping-pong buffers and history isolated across multiple cameras.
 * @internal
 */
export class SunLensFlareCameraState {
  historyValid = false;
  lastDepthOcclusion = false;
  lastSunU = 0.5;
  lastSunV = 0.5;
  lastElapsedTime = -1;

  private _visibilityTF: TransformFeedbackSimulator | null = null;
  private _computeVisA: VertexBufferBinding | null = null;
  private _computeVisB: VertexBufferBinding | null = null;
  private _computeReadIsA = true;
  private readonly _primitives = new Map<VertexBufferBinding, Primitive>();

  ensureVisibilityTF(engine: Engine, visibilityPass: ShaderPass): TransformFeedbackSimulator | null {
    if (this._visibilityTF) {
      return this._visibilityTF;
    }
    const feedbackVaryings = visibilityPass._feedbackVaryings;
    if (!feedbackVaryings || feedbackVaryings.length === 0) {
      return null;
    }
    const simulator = new TransformFeedbackSimulator(engine, 4, 1, visibilityPass, feedbackVaryings, "ping-pong");
    simulator.readBinding.buffer.setData(new Float32Array([1.0]));
    this._visibilityTF = simulator;
    return simulator;
  }

  /**
   * Run one temporal visibility update step using `ComputeShader` on WebGPU or Transform Feedback on WebGL2.
   * Returns the updated `VertexBufferBinding` holding the smoothed visibility float, or `null` on failure.
   */
  updateVisibility(
    engine: Engine,
    visibilityPass: ShaderPass | null,
    shaderData: ShaderData,
    feedbackElements: VertexElement[]
  ): VertexBufferBinding | null {
    if (engine._hardwareRenderer.supportsCompute) {
      if (!this._computeVisA) {
        const bufA = new Buffer(engine, BufferBindFlag.VertexBuffer, 4, BufferUsage.Dynamic, false);
        const bufB = new Buffer(engine, BufferBindFlag.VertexBuffer, 4, BufferUsage.Dynamic, false);
        bufA.isGCIgnored = true;
        bufB.isGCIgnored = true;
        bufA.setData(new Float32Array([1.0]));
        bufB.setData(new Float32Array([1.0]));
        this._computeVisA = new VertexBufferBinding(bufA, 4);
        this._computeVisB = new VertexBufferBinding(bufB, 4);
      }
      const readBinding = this._computeReadIsA ? this._computeVisA : this._computeVisB!;
      const writeBinding = this._computeReadIsA ? this._computeVisB! : this._computeVisA;
      const cs = getOrCreateVisibilityComputeShader(engine);
      shaderData.setBuffer("PrevVisibilityBuf", readBinding.buffer);
      shaderData.setBuffer("NextVisibilityBuf", writeBinding.buffer);
      cs.dispatch(1, 1, 1, shaderData);
      shaderData.setBuffer("PrevVisibilityBuf", null);
      shaderData.setBuffer("NextVisibilityBuf", null);
      this._computeReadIsA = !this._computeReadIsA;
      return writeBinding;
    }

    if (!visibilityPass) {
      return null;
    }
    const simulator = this.ensureVisibilityTF(engine, visibilityPass);
    if (!simulator || !simulator.beginUpdate(shaderData, feedbackElements, [], [])) {
      return null;
    }
    try {
      simulator.draw(MeshTopology.Points, 0, 1);
    } finally {
      simulator.endUpdate();
    }
    return simulator.readBinding;
  }

  getOrCreatePrimitive(
    engine: Engine,
    visibilityBinding: VertexBufferBinding,
    cornerBinding: VertexBufferBinding,
    instanceBinding: VertexBufferBinding,
    indexBinding: IndexBufferBinding,
    instanceCount: number,
    visibilityStepRate: number
  ): Primitive {
    let primitive = this._primitives.get(visibilityBinding);
    if (primitive) {
      return primitive;
    }
    primitive = new Primitive(engine);
    primitive.isGCIgnored = true;
    primitive.instanceCount = instanceCount;
    primitive.setVertexBufferBinding(0, cornerBinding);
    primitive.setVertexBufferBinding(1, instanceBinding);
    primitive.setVertexBufferBinding(2, visibilityBinding);
    primitive.setIndexBufferBinding(indexBinding);
    primitive.addVertexElement(new VertexElement("a_QuadCorner", 0, VertexElementFormat.Vector2, 0, 0));
    primitive.addVertexElement(new VertexElement("a_FlareGeo", 0, VertexElementFormat.Vector4, 1, 1));
    primitive.addVertexElement(new VertexElement("a_FlareHue", 16, VertexElementFormat.Vector4, 1, 1));
    primitive.addVertexElement(
      new VertexElement("a_SunVisibility", 0, VertexElementFormat.Float, 2, visibilityStepRate)
    );
    this._primitives.set(visibilityBinding, primitive);
    return primitive;
  }

  invalidateHistory(): void {
    this.historyValid = false;
    this.lastElapsedTime = -1;
  }

  destroy(): void {
    for (const primitive of this._primitives.values()) {
      primitive.destroy();
    }
    this._primitives.clear();
    this._visibilityTF?.destroy();
    this._visibilityTF = null;
    this._computeVisA?.buffer.destroy();
    this._computeVisB?.buffer.destroy();
    this._computeVisA = null;
    this._computeVisB = null;
    this._computeReadIsA = true;
    this.historyValid = false;
    this.lastElapsedTime = -1;
  }
}
