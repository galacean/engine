import { Engine } from "../Engine";
import { PipelineStage } from "../RenderPipeline/enums/PipelineStage";
import skyProceduralFs from "../shaderlib/extra/SkyProcedural.fs.glsl";
import skyProceduralVs from "../shaderlib/extra/SkyProcedural.vs.glsl";
import backgroundTextureFs from "../shaderlib/extra/background-texture.fs.glsl";
import backgroundTextureVs from "../shaderlib/extra/background-texture.vs.glsl";
import blinnPhongFs from "../shaderlib/extra/blinn-phong.fs.glsl";
import blinnPhongVs from "../shaderlib/extra/blinn-phong.vs.glsl";
import depthOnlyFs from "../shaderlib/extra/depthOnly.fs.glsl";
import depthOnlyVs from "../shaderlib/extra/depthOnly.vs.glsl";
import particleFs from "../shaderlib/extra/particle.fs.glsl";
import particleVs from "../shaderlib/extra/particle.vs.glsl";
import pbrSpecularFs from "../shaderlib/extra/pbr-specular.fs.glsl";
import pbrFs from "../shaderlib/extra/pbr.fs.glsl";
import pbrVs from "../shaderlib/extra/pbr.vs.glsl";
import shadowMapFs from "../shaderlib/extra/shadow-map.fs.glsl";
import shadowMapVs from "../shaderlib/extra/shadow-map.vs.glsl";
import skyboxFs from "../shaderlib/extra/skybox.fs.glsl";
import skyboxVs from "../shaderlib/extra/skybox.vs.glsl";
import spriteMaskFs from "../shaderlib/extra/sprite-mask.fs.glsl";
import spriteMaskVs from "../shaderlib/extra/sprite-mask.vs.glsl";
import spriteFs from "../shaderlib/extra/sprite.fs.glsl";
import spriteVs from "../shaderlib/extra/sprite.vs.glsl";
import unlitFs from "../shaderlib/extra/unlit.fs.glsl";
import unlitVs from "../shaderlib/extra/unlit.vs.glsl";
import { Shader } from "./Shader";
import { ShaderPass } from "./ShaderPass";

/**
 * Internal shader pool.
 * @internal
 */
export class ShaderPool {
  private static _initialized = false;

  static init(engine: Engine): void {
    if (this._initialized) return;
    this._initialized = true;

    const shadowCasterPass = new ShaderPass(engine, "ShadowCaster", shadowMapVs, shadowMapFs, {
      pipelineStage: PipelineStage.ShadowCaster
    });
    const depthOnlyPass = new ShaderPass(engine, "DepthOnly", depthOnlyVs, depthOnlyFs, {
      pipelineStage: PipelineStage.DepthOnly
    });
    const basePasses = [shadowCasterPass, depthOnlyPass];

    const forwardPassTags = {
      pipelineStage: PipelineStage.Forward
    };

    Shader.create(engine, "blinn-phong", [
      new ShaderPass(engine, "Forward", blinnPhongVs, blinnPhongFs, forwardPassTags),
      ...basePasses
    ]);
    Shader.create(engine, "pbr", [new ShaderPass(engine, "Forward", pbrVs, pbrFs, forwardPassTags), ...basePasses]);
    Shader.create(engine, "pbr-specular", [
      new ShaderPass(engine, "Forward", pbrVs, pbrSpecularFs, forwardPassTags),
      ...basePasses
    ]);
    Shader.create(engine, "unlit", [
      new ShaderPass(engine, "Forward", unlitVs, unlitFs, forwardPassTags),
      ...basePasses
    ]);

    Shader.create(engine, "skybox", [new ShaderPass(engine, "Forward", skyboxVs, skyboxFs, forwardPassTags)]);
    Shader.create(engine, "SkyProcedural", [
      new ShaderPass(engine, "Forward", skyProceduralVs, skyProceduralFs, forwardPassTags)
    ]);

    Shader.create(engine, "particle-shader", [
      new ShaderPass(engine, "Forward", particleVs, particleFs, forwardPassTags)
    ]);
    Shader.create(engine, "SpriteMask", [
      new ShaderPass(engine, "Forward", spriteMaskVs, spriteMaskFs, forwardPassTags)
    ]);
    Shader.create(engine, "Sprite", [new ShaderPass(engine, "Forward", spriteVs, spriteFs, forwardPassTags)]);
    Shader.create(engine, "background-texture", [
      new ShaderPass(engine, "Forward", backgroundTextureVs, backgroundTextureFs, forwardPassTags)
    ]);
  }
}
