import { Engine } from "../Engine";
import { Buffer } from "../graphic/Buffer";
import { TransformFeedbackPrimitive } from "../graphic/TransformFeedbackPrimitive";
import { VertexBufferBinding } from "../graphic/VertexBufferBinding";
import { MeshTopology } from "../graphic/enums/MeshTopology";
import { ShaderFactory } from "../shaderlib/ShaderFactory";
import { ShaderMacro } from "../shader/ShaderMacro";
import { ShaderProgram } from "../shader/ShaderProgram";
import { ShaderData } from "../shader/ShaderData";
import { ShaderProperty } from "../shader/ShaderProperty";
import { Logger } from "../base/Logger";
import { ParticleBufferUtils } from "./ParticleBufferUtils";

/**
 * @internal
 * Particle-specific Transform Feedback simulator.
 * Uses TransformFeedbackPrimitive for ping-pong buffer/VAO management,
 * handles shader compilation, uniform upload, and particle data initialization.
 */
export class ParticleTransformFeedbackSimulator {
  private static readonly _deltaTimeProperty = ShaderProperty.getByName("renderer_DeltaTime");

  private _engine: Engine;
  private _primitive: TransformFeedbackPrimitive;

  private _tfProgram: ShaderProgram;
  private _lastMacroHash = "";

  private _tempParticleData = new Float32Array(6);
  private _initialized = false;

  get readBinding(): VertexBufferBinding {
    return this._primitive.readBinding;
  }

  constructor(engine: Engine) {
    this._engine = engine;
    this._primitive = new TransformFeedbackPrimitive(engine, ParticleBufferUtils.feedbackVertexStride);
  }

  resize(particleCount: number): void {
    this._primitive.resize(particleCount);
    this._initialized = true;
  }

  /**
   * Write initial position/velocity for a newly emitted particle into both ping-pong buffers.
   */
  writeParticleData(index: number, px: number, py: number, pz: number, vx: number, vy: number, vz: number): void {
    if (!this._initialized) return;
    const data = this._tempParticleData;
    data[0] = px;
    data[1] = py;
    data[2] = pz;
    data[3] = vx;
    data[4] = vy;
    data[5] = vz;
    const byteOffset = index * ParticleBufferUtils.feedbackVertexStride;
    this._primitive.readBinding.buffer.setData(data, byteOffset);
    this._primitive.writeBinding.buffer.setData(data, byteOffset);
  }

  update(
    instanceBuffer: Buffer,
    shaderData: ShaderData,
    macros: readonly ShaderMacro[],
    particleCount: number,
    firstActive: number,
    firstFree: number,
    deltaTime: number
  ): void {
    if (!this._initialized || firstActive === firstFree) return;

    const rhi = this._engine._hardwareRenderer;

    // Recompile TF program if macros changed
    const macroHash = this._getMacroHash(macros);
    if (macroHash !== this._lastMacroHash) {
      this._compileTFProgram(macros);
      this._lastMacroHash = macroHash;
    }

    if (!this._tfProgram || !this._tfProgram.isValid) return;

    // --- TF pass ---
    this._tfProgram.bind();
    rhi.enableRasterizerDiscard();

    // Upload uniforms
    shaderData.setFloat(ParticleTransformFeedbackSimulator._deltaTimeProperty, deltaTime);
    this._tfProgram.uploadUniforms(this._tfProgram.rendererUniformBlock, shaderData);
    this._tfProgram.uploadUniforms(this._tfProgram.otherUniformBlock, shaderData);

    // Update attribute layout if program changed
    const instanceBinding = new VertexBufferBinding(instanceBuffer, ParticleBufferUtils.instanceVertexStride);
    this._primitive.updateVertexLayout(
      this._tfProgram,
      ParticleBufferUtils.feedbackVertexElements,
      instanceBinding,
      ParticleBufferUtils.feedbackInstanceElements
    );

    // Draw alive particles (ring buffer may wrap into two segments)
    this._primitive.beginDraw();
    if (firstActive < firstFree) {
      this._primitive.draw(MeshTopology.Points, firstActive, firstFree - firstActive);
    } else {
      this._primitive.draw(MeshTopology.Points, firstActive, particleCount - firstActive);
      if (firstFree > 0) {
        this._primitive.draw(MeshTopology.Points, 0, firstFree);
      }
    }
    this._primitive.endDraw();
    rhi.disableRasterizerDiscard();

    // Swap ping-pong
    this._primitive.swap();

    // Invalidate engine's cached shader program state
    rhi.invalidateShaderProgramState();
  }

  destroy(): void {
    this._primitive?.destroy();
    this._tfProgram?.destroy();
  }

  private _getMacroHash(macros: readonly ShaderMacro[]): string {
    const relevant = macros.filter(
      (m) => m.name.startsWith("RENDERER_VOL") || m.name.startsWith("RENDERER_FOL") || m.name.startsWith("RENDERER_LVL")
    );
    return relevant.map((m) => (m.value ? `${m.name}=${m.value}` : m.name)).join("|");
  }

  private _compileTFProgram(macros: readonly ShaderMacro[]): void {
    this._tfProgram?.destroy();
    this._tfProgram = null;

    const engine = this._engine;
    if (!engine._hardwareRenderer.isWebGL2) return;

    let vertexSource = ShaderFactory.parseIncludes(`#include <particle_transform_feedback_update>`);
    const macroStr = ShaderFactory.parseCustomMacros(macros as ShaderMacro[]);
    vertexSource = macroStr + vertexSource;
    vertexSource = ShaderFactory.convertTo300(vertexSource);
    vertexSource = `#version 300 es\nprecision highp float;\n` + vertexSource;

    const fragmentSource = `#version 300 es\nprecision highp float;\nvoid main() { discard; }`;

    this._tfProgram = new ShaderProgram(engine, vertexSource, fragmentSource, ["v_FeedbackPosition", "v_FeedbackVelocity"]);

    if (!this._tfProgram.isValid) {
      Logger.error("Failed to compile Transform Feedback shader program.");
      this._tfProgram = null;
    }
  }
}
