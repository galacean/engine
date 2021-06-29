import blinnPhongFs from "../shaderlib/extra/blinn-phong.fs.glsl";
import blinnPhongVs from "../shaderlib/extra/blinn-phong.vs.glsl";
import default2dFs from "../shaderlib/extra/default2d.fs.glsl";
import default2dVs from "../shaderlib/extra/default2d.vs.glsl";
import particleFs from "../shaderlib/extra/particle.fs.glsl";
import particleVs from "../shaderlib/extra/particle.vs.glsl";
import pbrFs from "../shaderlib/extra/pbr.fs.glsl";
import pbrVs from "../shaderlib/extra/pbr.vs.glsl";
import shadowMapFs from "../shaderlib/extra/shadow-map.fs.glsl";
import shadowMapVs from "../shaderlib/extra/shadow-map.vs.glsl";
import shadowFs from "../shaderlib/extra/shadow.fs.glsl";
import skyboxFs from "../shaderlib/extra/skybox.fs.glsl";
import skyboxVs from "../shaderlib/extra/skybox.vs.glsl";
import spriteMaskFs from "../shaderlib/extra/sprite-mask.fs.glsl";
import spriteMaskVs from "../shaderlib/extra/sprite-mask.vs.glsl";
import unlitFs from "../shaderlib/extra/unlit.fs.glsl";
import unlitVs from "../shaderlib/extra/unlit.vs.glsl";
import { Shader } from "./Shader";

/**
 * Internal shader pool.
 * @internal
 */
export class ShaderPool {
  static init(): void {
    Shader.create("blinn-phong", blinnPhongVs, blinnPhongFs);
    Shader.create("pbr", pbrVs, pbrFs);
    Shader.create("unlit", unlitVs, unlitFs);
    Shader.create("shadow-map", shadowMapVs, shadowMapFs);
    Shader.create("shadow", shadowMapVs, shadowFs);
    Shader.create("skybox", skyboxVs, skyboxFs);
    Shader.create("particle-shader", particleVs, particleFs);
    Shader.create("SpriteMask", spriteMaskVs, spriteMaskFs);
    Shader.create("Default2D", default2dVs, default2dFs);
  }
}
