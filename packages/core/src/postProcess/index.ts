import { Shader } from "../shader";
import { ShaderLib } from "../shaderlib";
import { PostProcessManager } from "./PostProcessManager";

import blitVs from "../shaderlib/extra/Blit.vs.glsl";
import Filtering from "./shaders/Filtering.glsl";
import PostCommon from "./shaders/PostCommon.glsl";
import ACESTonemapping from "./shaders/Tonemapping/ACES/ACESTonemapping.glsl";
import ColorTransform from "./shaders/Tonemapping/ACES/ColorTransform.glsl";
import ODT from "./shaders/Tonemapping/ACES/ODT.glsl";
import RRT from "./shaders/Tonemapping/ACES/RRT.glsl";
import Tonescale from "./shaders/Tonemapping/ACES/Tonescale.glsl";
import NeutralTonemapping from "./shaders/Tonemapping/NeutralTonemapping.glsl";
import UberPost from "./shaders/UberPost.glsl";

export * from "./effects";
export { PostProcess } from "./PostProcess";
export { PostProcessEffect, RenderPostProcessEvent } from "./PostProcessEffect";
export { PostProcessManager };

Object.assign(ShaderLib, {
  PostCommon,
  Filtering,
  ODT,
  RRT,
  Tonescale,
  ColorTransform,
  NeutralTonemapping,
  ACESTonemapping
});

Shader.create(PostProcessManager.UBER_SHADER_NAME, blitVs, UberPost);
