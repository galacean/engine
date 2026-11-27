import {
  Buffer,
  BufferBindFlag,
  BufferUsage,
  ComputeShader,
  Engine,
  EngineEventType,
  MeshTopology,
  Shader,
  ShaderData,
  ShaderDataGroup,
  ShaderPass,
  ShaderProperty,
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
const PROP_TOTAL_COUNT = ShaderProperty.getByName("totalCount");
const PROP_FIRST_INSTANCE = ShaderProperty.getByName("firstInstance");
const PROP_INSTANCE_COUNT = ShaderProperty.getByName("instanceCount");
const PROP_DT = ShaderProperty.getByName("dt");
const PROP_WALL_HEIGHT_DELTA = ShaderProperty.getByName("wallHeightDelta");
const PROP_ROOF_PIVOT_Y = ShaderProperty.getByName("roofPivotY");
const PROP_ANIMATION_T = ShaderProperty.getByName("animationT");

function gravityPass(engine?: Engine): ShaderPass {
  let shader = Shader.find(SHADER_NAME);
  if (!shader) {
    // Galacean's scalar uniform setter is signed; validated instance ranges fit int32.
    const bodyMatch = /void\s+main\s*\(\s*\)\s*\{([\s\S]*)\}\s*$/.exec(gravityVertexSource);
    const mainBody = (bodyMatch ? bodyMatch[1] : "")
      .replace(
        "i < firstInstance || i - firstInstance >= instanceCount",
        "i < uint(firstInstance) || i - uint(firstInstance) >= uint(instanceCount)"
      )
      .replace(/\breturn;/g, "return v;")
      .replace(/\b(record[0-3])\b/g, "a.$1")
      .replace(/\b(result[0-3])\b/g, "v.$1");
    const shaderLab = `Shader "${SHADER_NAME}" {
      SubShader "Default" {
        Pass "Gravity64" {
          int firstInstance;
          int instanceCount;
          float dt;
          float wallHeightDelta;
          float roofPivotY;
          float animationT;
          struct Attributes {
            uvec4 record0;
            uvec4 record1;
            uvec4 record2;
            uvec4 record3;
          };
          struct Varyings {
            flat uvec4 result0;
            flat uvec4 result1;
            flat uvec4 result2;
            flat uvec4 result3;
          };
          Varyings vert(Attributes a) {
            Varyings v;
            ${mainBody}
            return v;
          }
          void frag() {
            gl_FragColor = vec4(0.0);
          }
          VertexShader = vert;
          FragmentShader = frag;
        }
      }
    }`;
    shader = engine ? Shader.create(shaderLab, engine)! : Shader.create(shaderLab)!;
  }
  return shader.subShaders[0].passes[0];
}

const roofComputeCache = new WeakMap<Engine, ComputeShader>();

function getOrCreateRoofComputeShader(engine: Engine): ComputeShader {
  let cs = roofComputeCache.get(engine);
  if (!cs || cs.destroyed) {
    const bodyMatch = /void\s+main\s*\(\s*\)\s*\{([\s\S]*)\}\s*$/.exec(gravityVertexSource);
    const computeBody = (bodyMatch ? bodyMatch[1] : "")
      .replace("gl_Position = vec4(0.0, 0.0, 0.0, 1.0);", "")
      .replace("uint i = uint(gl_VertexID);", "")
      .replace(
        "i < firstInstance || i - firstInstance >= instanceCount",
        "i < uint(firstInstance) || i - uint(firstInstance) >= uint(instanceCount)"
      )
      .replace(/\brecord0\b/g, "inRecords[base]")
      .replace(/\brecord1\b/g, "inRecords[base + 1u]")
      .replace(/\brecord2\b/g, "inRecords[base + 2u]")
      .replace(/\brecord3\b/g, "inRecords[base + 3u]")
      .replace(/\bresult0\b/g, "outRecords[base]")
      .replace(/\bresult1\b/g, "outRecords[base + 1u]")
      .replace(/\bresult2\b/g, "outRecords[base + 2u]")
      .replace(/\bresult3\b/g, "outRecords[base + 3u]");
    const source = `ComputeShader "${SHADER_NAME}Compute" {
      WorkgroupSize = (64, 1, 1);
      ComputeKernel = csGravity;

      int totalCount;
      int firstInstance;
      int instanceCount;
      float dt;
      float wallHeightDelta;
      float roofPivotY;
      float animationT;

      readonly storage InRecords {
        uvec4 inRecords[];
      };

      storage OutRecords {
        uvec4 outRecords[];
      };

      void csGravity() {
        uint i = gl_GlobalInvocationID.x;
        if (i >= uint(totalCount)) return;
        uint base = i * 4u;
        ${computeBody}
      }
    }`;
    cs = ComputeShader.create(source, engine);
    roofComputeCache.set(engine, cs);
    engine.once(EngineEventType.Shutdown, () => {
      if (roofComputeCache.get(engine) === cs) {
        roofComputeCache.delete(engine);
      }
      cs!.destroy();
    });
  }
  return cs;
}

/**
 * Product adapter for GPU roof gravity simulation on the render Engine.
 * Dispatches native `ComputeShader` on WebGPU or `TransformFeedbackSimulator` on WebGL2.
 */
export class EngineRoofFeedback {
  readonly count: number;
  readonly stride = STRIDE;
  readonly metrics = { uploadBytes: 0, dispatches: 0, submitMs: 0, readbacks: 0 };
  revision = 0;
  private readonly _useCompute: boolean;
  private readonly _simulator?: TransformFeedbackSimulator;
  private readonly _computeShader?: ComputeShader;
  private readonly _computeBindingA?: VertexBufferBinding;
  private readonly _computeBindingB?: VertexBufferBinding;
  private _computeReadIsA = true;
  private readonly _shaderData = new RendererShaderData(ShaderDataGroup.Renderer);
  private _destroyed = false;

  constructor(engine: Engine, initial: ArrayBuffer | ArrayBufferView) {
    const rhi = (engine as Engine & { _hardwareRenderer: { supportsRendering: boolean; supportsCompute: boolean } })
      ._hardwareRenderer;
    if (!rhi.supportsRendering) throw new Error("Roof feedback requires WebGL2 or WebGPU");
    const bytes =
      initial instanceof ArrayBuffer
        ? new Uint8Array(initial)
        : ArrayBuffer.isView(initial)
          ? new Uint8Array(initial.buffer, initial.byteOffset, initial.byteLength)
          : null;
    if (!bytes || bytes.byteLength % STRIDE) throw new Error("Roof feedback requires whole 64-byte records");
    this.count = bytes.byteLength / STRIDE;
    if (this.count > 0x7fffffff) throw new RangeError("Roof feedback exceeds signed draw count");
    this._useCompute = Boolean(rhi.supportsCompute);

    if (this._useCompute) {
      this._computeShader = getOrCreateRoofComputeShader(engine);
      const byteLength = Math.max(1, this.count) * STRIDE;
      const bufA = new Buffer(engine, BufferBindFlag.VertexBuffer, byteLength, BufferUsage.Dynamic, false);
      const bufB = new Buffer(engine, BufferBindFlag.VertexBuffer, byteLength, BufferUsage.Dynamic, false);
      bufA.isGCIgnored = true;
      bufB.isGCIgnored = true;
      this._computeBindingA = new VertexBufferBinding(bufA, STRIDE);
      this._computeBindingB = new VertexBufferBinding(bufB, STRIDE);
      try {
        if (bytes.length) bufA.setData(bytes);
        this.metrics.uploadBytes = bytes.byteLength;
      } catch (error) {
        bufA.destroy();
        bufB.destroy();
        throw error;
      }
    } else {
      this._simulator = new TransformFeedbackSimulator(engine, STRIDE, this.count, gravityPass(engine), VARYINGS);
      try {
        if (bytes.length) this._simulator.readBinding.buffer.setData(bytes);
        this.metrics.uploadBytes = bytes.byteLength;
      } catch (error) {
        this._simulator.destroy();
        throw error;
      }
    }
  }

  get readBinding(): VertexBufferBinding {
    if (this._destroyed) throw new Error("Roof feedback has been destroyed");
    if (this._useCompute) {
      return this._computeReadIsA ? this._computeBindingA! : this._computeBindingB!;
    }
    return this._simulator!.readBinding;
  }

  step(step: GravityStep): VertexBufferBinding {
    return this.run([step]);
  }

  run(timeline: GravityStep[]): VertexBufferBinding {
    if (this._destroyed) throw new Error("Roof feedback has been destroyed");
    if (!Array.isArray(timeline)) throw new TypeError("Gravity timeline must be an array");
    for (const step of timeline) validateGravityStep(step, this.count);
    const start = performance.now();
    const data = this._shaderData;
    try {
      for (const step of timeline) {
        if (!step.instance_count) continue;
        data.setInt(PROP_FIRST_INSTANCE, step.first_instance);
        data.setInt(PROP_INSTANCE_COUNT, step.instance_count);
        data.setFloat(PROP_DT, step.dt);
        data.setFloat(PROP_WALL_HEIGHT_DELTA, step.wall_height_delta);
        data.setFloat(PROP_ROOF_PIVOT_Y, step.roof_pivot_y);
        data.setFloat(PROP_ANIMATION_T, step.animation_t);

        if (this._useCompute) {
          const readBinding = this._computeReadIsA ? this._computeBindingA! : this._computeBindingB!;
          const writeBinding = this._computeReadIsA ? this._computeBindingB! : this._computeBindingA!;
          data.setInt(PROP_TOTAL_COUNT, this.count);
          data.setBuffer("InRecords", readBinding.buffer);
          data.setBuffer("OutRecords", writeBinding.buffer);
          try {
            this._computeShader!.dispatch(Math.ceil(this.count / 64), 1, 1, data);
          } finally {
            data.setBuffer("InRecords", null);
            data.setBuffer("OutRecords", null);
          }
          this._computeReadIsA = !this._computeReadIsA;
        } else {
          const simulator = this._simulator!;
          if (!simulator.beginUpdate(data, ELEMENTS, NO_INPUTS, NO_ELEMENTS))
            throw new Error("Roof gravity program failed");
          try {
            // Preserve untouched records too; swapping a partially written target loses them.
            simulator.draw(MeshTopology.Points, 0, this.count);
          } finally {
            simulator.endUpdate();
          }
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
    this._simulator?.destroy();
    this._computeBindingA?.buffer.destroy();
    this._computeBindingB?.buffer.destroy();
  }
}
