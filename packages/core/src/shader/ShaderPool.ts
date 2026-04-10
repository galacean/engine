import { TransformFeedbackShader } from "../graphic/TransformFeedbackShader";

/**
 * Internal shader pool.
 * @internal
 *
 * Built-in shaders (pbr, blinn-phong, unlit, etc.) are now registered by
 * the @galacean/engine-shader package via `registerShaders()`.
 * ShaderPool only handles the TransformFeedbackShader which cannot be
 * expressed in ShaderLab.
 */
export class ShaderPool {
  /** @internal */
  static particleFeedbackShader: TransformFeedbackShader;

  static init(): void {
    ShaderPool.particleFeedbackShader = new TransformFeedbackShader(
      `#include <Particle/ParticleFeedback.glsl>`,
      `void main() { discard; }`,
      ["v_FeedbackPosition", "v_FeedbackVelocity"]
    );
  }
}
