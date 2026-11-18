import {
  Engine,
  MeshTopology,
  Shader,
  ShaderData,
  ShaderDataGroup,
  ShaderLanguage,
  ShaderPass,
  TransformFeedbackSimulator,
  VertexBufferBinding,
  VertexElement,
  VertexElementFormat
} from "@galacean/engine";
import { gravityVertexSource, validateGravityStep } from "./RoofGravityKernel.js";

export interface GravityStep {
  first_instance: number;
  instance_count: number;
  dt: number;
  wall_height_delta: number;
  roof_pivot_y: number;
  animation_t: number;
}

const STRIDE = 64;
const VARYINGS = ["result0", "result1", "result2", "result3"];
const ELEMENTS = [0, 1, 2, 3].map((i) => new VertexElement(`record${i}`, i * 16, VertexElementFormat.UInt4, 0));
const NO_INPUTS: VertexBufferBinding[] = [];
const NO_ELEMENTS: VertexElement[] = [];
const SHADER_NAME = "TinyGlade/RoofGravity64";
// Engine-owned group is required; its constructor is stripped from public d.ts.
// Keep this internal bridge explicit instead of constructing an ungrouped object.
const RendererShaderData = ShaderData as unknown as new (group: ShaderDataGroup) => ShaderData;

function gravityPass(): ShaderPass {
  let shader = Shader.find(SHADER_NAME);
  if (!shader) {
    // Galacean's scalar uniform setter is signed; validated instance ranges fit int32.
    const vertex = gravityVertexSource
      .replace(/^#version 300 es\s*/, "")
      .replace("uniform uint firstInstance;", "uniform int firstInstance;")
      .replace("uniform uint instanceCount;", "uniform int instanceCount;")
      .replace(
        "i < firstInstance || i - firstInstance >= instanceCount",
        "i < uint(firstInstance) || i - uint(firstInstance) >= uint(instanceCount)"
      );
    const pass = new ShaderPass(
      "Gravity64",
      [[0, vertex]],
      [[0, "precision highp float; out vec4 color; void main(){ color=vec4(0.0); }"]],
      ShaderLanguage.GLSLES300
    );
    shader = Shader.create(SHADER_NAME, [pass])!;
  }
  return shader.subShaders[0].passes[0];
}

/**
 * Product adapter for PR3071's TransformFeedbackSimulator, on the render Engine.
 * Its readBinding is the exact GPU output consumed by subsequent rendering.
 * Static/packed ABI fields pass through unchanged. CPU only uploads initial64
 * once and per-step uniforms; no staging texture, fence, or GPU-to-CPU download.
 * The owning scene reseeds from source and reruns its timeline after context loss,
 * then rebinds the final output. Detach borrowed rendering bindings before destroy().
 * The Engine owns the shared program cache.
 */
export class EngineRoofFeedback {
  readonly count: number;
  readonly stride = STRIDE;
  readonly metrics = { uploadBytes: 0, dispatches: 0, submitMs: 0, readbacks: 0 };
  revision = 0;
  private readonly _simulator: TransformFeedbackSimulator;
  private readonly _shaderData = new RendererShaderData(ShaderDataGroup.Renderer);
  private _destroyed = false;

  constructor(engine: Engine, initial: ArrayBuffer | ArrayBufferView) {
    // This adapter shares the engine device with the recovered shader backend.
    if (!(engine as Engine & { _hardwareRenderer: { isWebGL2: boolean } })._hardwareRenderer.isWebGL2)
      throw new Error("Roof feedback requires WebGL2");
    const bytes =
      initial instanceof ArrayBuffer
        ? new Uint8Array(initial)
        : ArrayBuffer.isView(initial)
          ? new Uint8Array(initial.buffer, initial.byteOffset, initial.byteLength)
          : null;
    if (!bytes || bytes.byteLength % STRIDE) throw new Error("Roof feedback requires whole 64-byte records");
    this.count = bytes.byteLength / STRIDE;
    if (this.count > 0x7fffffff) throw new RangeError("Roof feedback exceeds signed draw count");
    this._simulator = new TransformFeedbackSimulator(engine, STRIDE, this.count, gravityPass(), VARYINGS);
    try {
      if (bytes.length) this._simulator.readBinding.buffer.setData(bytes);
      this.metrics.uploadBytes = bytes.byteLength;
    } catch (error) {
      this._simulator.destroy();
      throw error;
    }
  }

  get readBinding(): VertexBufferBinding {
    if (this._destroyed) throw new Error("Roof feedback has been destroyed");
    return this._simulator.readBinding;
  }

  step(step: GravityStep): VertexBufferBinding {
    return this.run([step]);
  }

  run(timeline: GravityStep[]): VertexBufferBinding {
    if (this._destroyed) throw new Error("Roof feedback has been destroyed");
    if (!Array.isArray(timeline)) throw new TypeError("Gravity timeline must be an array");
    for (const step of timeline) validateGravityStep(step, this.count);
    const start = performance.now();
    const data = this._shaderData,
      simulator = this._simulator;
    try {
      for (const step of timeline) {
        if (!step.instance_count) continue;
        data.setInt("firstInstance", step.first_instance);
        data.setInt("instanceCount", step.instance_count);
        data.setFloat("dt", step.dt);
        data.setFloat("wallHeightDelta", step.wall_height_delta);
        data.setFloat("roofPivotY", step.roof_pivot_y);
        data.setFloat("animationT", step.animation_t);
        if (!simulator.beginUpdate(data, ELEMENTS, NO_INPUTS, NO_ELEMENTS))
          throw new Error("Roof gravity program failed");
        try {
          // Preserve untouched records too; swapping a partially written target loses them.
          simulator.draw(MeshTopology.Points, 0, this.count);
        } finally {
          simulator.endUpdate();
        }
        this.revision++;
        this.metrics.dispatches++;
      }
      return this.readBinding;
    } finally {
      this.metrics.submitMs += performance.now() - start;
    }
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._simulator.destroy();
  }
}
