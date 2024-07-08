import { Shader } from "../shader";
import { ShaderLib } from "../shaderlib";
import { PostProcessManager } from "./PostProcessManager";

import blitVs from "../shaderlib/extra/Blit.vs.glsl";
import Filtering from "./shaders/Filtering.glsl";
import PostCommon from "./shaders/PostCommon.glsl";
import ACESTonemapping from "./shaders/Tonemapping/ACESTonemapping.glsl";
import ColorTransform from "./shaders/Tonemapping/ColorTransform.glsl";
import NeutralTonemapping from "./shaders/Tonemapping/NeutralTonemapping.glsl";
import ODT from "./shaders/Tonemapping/ODT.glsl";
import RRT from "./shaders/Tonemapping/RRT.glsl";
import Tonescale from "./shaders/Tonemapping/Tonescale.glsl";
import UberPost from "./shaders/UberPost.glsl";

export { PostProcessManager } from "./PostProcessManager";
export * from "./effects";

Object.assign(ShaderLib, {
  PostCommon,
  Filtering,
  ODT,
  RRT,
  Tonescale,
  ColorTransform,
  ACESTonemapping,
  NeutralTonemapping
});

Shader.create(PostProcessManager.UBER_SHADER_NAME, blitVs, UberPost);
