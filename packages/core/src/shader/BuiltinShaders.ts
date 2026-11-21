import type { Shader } from "./Shader";

/**
 * @internal
 */
export interface BuiltinShaders {
  readonly blit: Shader;
  readonly blitScreen: Shader;
  readonly pbr: Shader;
  readonly blinnPhong: Shader;
  readonly unlit: Shader;
  readonly skybox: Shader;
  readonly skyProcedural: Shader;
  readonly backgroundTexture: Shader;
  readonly sprite: Shader;
  readonly spriteMask: Shader;
  readonly text: Shader;
  readonly trail: Shader;
  readonly ui: Shader;
  readonly spine: Shader;
  readonly particle: Shader;
  readonly particleFeedback: Shader;
  readonly uber: Shader;
  readonly finalSRGB: Shader;
  readonly finalAntiAliasing: Shader;
  readonly bloom: Shader;
  readonly scalableAmbientOcclusion: Shader;
}
