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
import trailVs from "../shaderlib/trail.vs.glsl";
import trailFs from "../shaderlib/trail.fs.glsl";
import { Shader } from "./Shader";
import { ShaderPass } from "./ShaderPass";

/**
 * Internal shader pool.
 * @internal
 */
export class ShaderPool {
  /** @internal */
  _shaderMap: Record<string, Shader>;
  /** @internal */
  private _engine: Engine;

  constructor(engine: Engine) {
    this._engine = engine;
    this._shaderMap = Object.create(null);
  }

  init() {
    const shadowCasterPass = new ShaderPass(this._engine, "ShadowCaster", shadowMapVs, shadowMapFs, {
      pipelineStage: PipelineStage.ShadowCaster
    });
    const depthOnlyPass = new ShaderPass(this._engine, "DepthOnly", depthOnlyVs, depthOnlyFs, {
      pipelineStage: PipelineStage.DepthOnly
    });
    const basePasses = [shadowCasterPass, depthOnlyPass];

    const forwardPassTags = {
      pipelineStage: PipelineStage.Forward
    };

    Shader.create(this._engine, "blinn-phong", [
      new ShaderPass(this._engine, "Forward", blinnPhongVs, blinnPhongFs, forwardPassTags),
      ...basePasses
    ]);
    Shader.create(this._engine, "pbr", [
      new ShaderPass(this._engine, "Forward", pbrVs, pbrFs, forwardPassTags),
      ...basePasses
    ]);
    Shader.create(this._engine, "pbr-specular", [
      new ShaderPass(this._engine, "Forward", pbrVs, pbrSpecularFs, forwardPassTags),
      ...basePasses
    ]);
    Shader.create(this._engine, "unlit", [
      new ShaderPass(this._engine, "Forward", unlitVs, unlitFs, forwardPassTags),
      ...basePasses
    ]);

    Shader.create(this._engine, "skybox", [
      new ShaderPass(this._engine, "Forward", skyboxVs, skyboxFs, forwardPassTags)
    ]);
    Shader.create(this._engine, "SkyProcedural", [
      new ShaderPass(this._engine, "Forward", skyProceduralVs, skyProceduralFs, forwardPassTags)
    ]);

    Shader.create(this._engine, "particle-shader", [
      new ShaderPass(this._engine, "Forward", particleVs, particleFs, forwardPassTags)
    ]);
    Shader.create(this._engine, "SpriteMask", [
      new ShaderPass(this._engine, "Forward", spriteMaskVs, spriteMaskFs, forwardPassTags)
    ]);
    Shader.create(this._engine, "Sprite", [
      new ShaderPass(this._engine, "Forward", spriteVs, spriteFs, forwardPassTags)
    ]);
    Shader.create(this._engine, "background-texture", [
      new ShaderPass(this._engine, "Forward", backgroundTextureVs, backgroundTextureFs, forwardPassTags)
    ]);

    Shader.create(this._engine, "trail", trailVs, trailFs);
  }

  /**
   * @internal
   */
  _destroy() {
    for (const shaderName in this._shaderMap) {
      const shader = this._shaderMap[shaderName];
      shader.destroy(true);
    }
    this._shaderMap = null;
  }

  /**
   * Find a shader by name.
   * @param name - Name of the shader
   */
  find(name: string): Shader {
    return this._shaderMap[name];
  }
}
