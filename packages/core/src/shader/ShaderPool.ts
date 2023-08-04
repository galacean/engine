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
  static init(): void {
    const shadowCasterPass = new ShaderPass(shadowMapVs, shadowMapFs, {
      pipelineStage: PipelineStage.ShadowCaster
    });
    const depthOnlyPass = new ShaderPass(depthOnlyVs, depthOnlyFs, {
      pipelineStage: PipelineStage.DepthOnly
    });
    const basePasses = [shadowCasterPass, depthOnlyPass];

    const forwardPassTags = {
      pipelineStage: PipelineStage.Forward
    };

    Shader.create("blinn-phong", [new ShaderPass(blinnPhongVs, blinnPhongFs, forwardPassTags), ...basePasses]);
    Shader.create("pbr", [new ShaderPass(pbrVs, pbrFs, forwardPassTags), ...basePasses]);
    Shader.create("pbr-specular", [new ShaderPass(pbrVs, pbrSpecularFs, forwardPassTags), ...basePasses]);
    Shader.create("unlit", [new ShaderPass(unlitVs, unlitFs, forwardPassTags), ...basePasses]);

    Shader.create("skybox", [new ShaderPass(skyboxVs, skyboxFs, forwardPassTags)]);
    Shader.create("SkyProcedural", [new ShaderPass(skyProceduralVs, skyProceduralFs, forwardPassTags)]);

    Shader.create("particle-shader", [new ShaderPass(particleVs, particleFs, forwardPassTags)]);
    Shader.create("SpriteMask", [new ShaderPass(spriteMaskVs, spriteMaskFs, forwardPassTags)]);
    Shader.create("Sprite", [new ShaderPass(spriteVs, spriteFs, forwardPassTags)]);
    Shader.create("background-texture", [new ShaderPass(backgroundTextureVs, backgroundTextureFs, forwardPassTags)]);
  }
}
