import { PipelineStage } from "../RenderPipeline/enums/PipelineStage";
import { BaseMaterial } from "../material/BaseMaterial";
import blitFs from "../shaderlib/extra/Blit.fs.glsl";
import blitScreenFs from "../shaderlib/extra/BlitScreen.fs.glsl";
import blitVs from "../shaderlib/extra/Blit.vs.glsl";
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
import spineFs from "../shaderlib/extra/spine.fs.glsl";
import spineVs from "../shaderlib/extra/spine.vs.glsl";
import textFs from "../shaderlib/extra/text.fs.glsl";
import textVs from "../shaderlib/extra/text.vs.glsl";
import trailFs from "../shaderlib/extra/trail.fs.glsl";
import trailVs from "../shaderlib/extra/trail.vs.glsl";
import unlitFs from "../shaderlib/extra/unlit.fs.glsl";
import unlitVs from "../shaderlib/extra/unlit.vs.glsl";
import { TransformFeedbackShader } from "../graphic/TransformFeedbackShader";
import { Shader } from "./Shader";
import { ShaderPass } from "./ShaderPass";
import { ShaderProperty } from "./ShaderProperty";
import { CullMode } from "./enums/CullMode";
import { RenderStateElementKey } from "./enums/RenderStateElementKey";
import { RenderQueueType } from "./enums/RenderQueueType";
import { RenderState } from "./state";

/**
 * Internal shader pool.
 * @internal
 */
export class ShaderPool {
  /** @internal */
  static particleFeedbackShader: TransformFeedbackShader;

  static init(): void {
    ShaderPool.particleFeedbackShader = new TransformFeedbackShader(
      `#include <particle_feedback_simulation>`,
      `void main() { discard; }`,
      ["v_FeedbackPosition", "v_FeedbackVelocity"]
    );
    const shadowCasterPass = new ShaderPass("ShadowCaster", shadowMapVs, shadowMapFs, {
      pipelineStage: PipelineStage.ShadowCaster
    });
    shadowCasterPass._renderState = new RenderState();
    shadowCasterPass._renderStateDataMap[RenderStateElementKey.RenderQueueType] =
      BaseMaterial._shadowCasterRenderQueueProp;

    const depthOnlyPass = new ShaderPass("DepthOnly", depthOnlyVs, depthOnlyFs, {
      pipelineStage: PipelineStage.DepthOnly
    });
    depthOnlyPass._renderState = new RenderState();
    depthOnlyPass._renderStateDataMap[RenderStateElementKey.RenderQueueType] = BaseMaterial._depthOnlyRenderQueueProp;

    const basePasses = [shadowCasterPass, depthOnlyPass];

    const forwardPassTags = {
      pipelineStage: PipelineStage.Forward
    };

    Shader.create("blinn-phong", [
      new ShaderPass("Forward", blinnPhongVs, blinnPhongFs, forwardPassTags),
      ...basePasses
    ]);
    Shader.create("pbr", [new ShaderPass("Forward", pbrVs, pbrFs, forwardPassTags), ...basePasses]);
    Shader.create("pbr-specular", [new ShaderPass("Forward", pbrVs, pbrSpecularFs, forwardPassTags), ...basePasses]);
    Shader.create("unlit", [new ShaderPass("Forward", unlitVs, unlitFs, forwardPassTags), ...basePasses]);

    Shader.create("blit", [new ShaderPass("Forward", blitVs, blitFs, forwardPassTags)]);
    Shader.create("blit-screen", [new ShaderPass("Forward", blitVs, blitScreenFs, forwardPassTags)]);
    Shader.create("skybox", [new ShaderPass("Forward", skyboxVs, skyboxFs, forwardPassTags)]);
    Shader.create("SkyProcedural", [new ShaderPass("Forward", skyProceduralVs, skyProceduralFs, forwardPassTags)]);

    Shader.create("particle-shader", [new ShaderPass("Forward", particleVs, particleFs, forwardPassTags)]);
    Shader.create("trail", [new ShaderPass("Forward", trailVs, trailFs, forwardPassTags)]);
    Shader.create("SpriteMask", [new ShaderPass("Forward", spriteMaskVs, spriteMaskFs, forwardPassTags)]);
    Shader.create("Sprite", [new ShaderPass("Forward", spriteVs, spriteFs, forwardPassTags)]);
    Shader.create("Text", [new ShaderPass("Forward", textVs, textFs, forwardPassTags)]);
    Shader.create("2D/Spine", [ShaderPool._createSpinePass(forwardPassTags)]);
    Shader.create("background-texture", [
      new ShaderPass("Forward", backgroundTextureVs, backgroundTextureFs, forwardPassTags)
    ]);
  }

  private static _createSpinePass(tags: Record<string, number | string | boolean>): ShaderPass {
    const pass = new ShaderPass("Forward", spineVs, spineFs, tags);
    const renderState = (pass._renderState = new RenderState());
    const blendState = renderState.blendState.targetBlendState;

    blendState.enabled = true;
    renderState.depthState.writeEnabled = false;
    renderState.rasterState.cullMode = CullMode.Off;
    renderState.renderQueueType = RenderQueueType.Transparent;

    const renderStateDataMap = pass._renderStateDataMap;
    renderStateDataMap[RenderStateElementKey.BlendStateSourceColorBlendFactor0] =
      ShaderProperty.getByName("sourceColorBlendFactor");
    renderStateDataMap[RenderStateElementKey.BlendStateDestinationColorBlendFactor0] =
      ShaderProperty.getByName("destinationColorBlendFactor");
    renderStateDataMap[RenderStateElementKey.BlendStateSourceAlphaBlendFactor0] =
      ShaderProperty.getByName("sourceAlphaBlendFactor");
    renderStateDataMap[RenderStateElementKey.BlendStateDestinationAlphaBlendFactor0] =
      ShaderProperty.getByName("destinationAlphaBlendFactor");

    return pass;
  }
}
