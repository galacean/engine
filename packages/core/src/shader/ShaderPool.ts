import blinnPhongFs from "../shaderlib/extra/blinn-phong.fs.glsl";
import blinnPhongVs from "../shaderlib/extra/blinn-phong.vs.glsl";
import particleFs from "../shaderlib/extra/particle.fs.glsl";
import particleVs from "../shaderlib/extra/particle.vs.glsl";
import pbrFs from "../shaderlib/extra/pbr.fs.glsl";
import pbrSpecularFs from "../shaderlib/extra/pbr-specular.fs.glsl";
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
import backgroundTextureVs from "../shaderlib/extra/background-texture.vs.glsl";
import backgroundTextureFs from "../shaderlib/extra/background-texture.fs.glsl";
import { Shader } from "./Shader";

/**
 * Internal shader pool.
 * @internal
 */
export class ShaderPool {
  static init(): void {
    Shader.create("blinn-phong", blinnPhongVs, blinnPhongFs);
    Shader.create("pbr", pbrVs, pbrFs);
    Shader.create("pbr-specular", pbrVs, pbrSpecularFs);
    Shader.create("unlit", unlitVs, unlitFs);
    Shader.create("shadow-map", shadowMapVs, shadowMapFs);
    Shader.create("skybox", skyboxVs, skyboxFs);
    Shader.create("particle-shader", particleVs, particleFs);
    Shader.create("SpriteMask", spriteMaskVs, spriteMaskFs);
    Shader.create("Sprite", spriteVs, spriteFs);
    Shader.create("background-texture", backgroundTextureVs, backgroundTextureFs);
  }
}
