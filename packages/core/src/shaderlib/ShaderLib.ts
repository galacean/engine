import camera_declare from "./camera_declare.glsl";
import common from "./common.glsl";
import common_vert from "./common_vert.glsl";
import transform_declare from "./transform_declare.glsl";

import color_share from "./color_share.glsl";
import FogFragmentDeclaration from "./FogFragmentDeclaration.glsl";
import FogVertexDeclaration from "./FogVertexDeclaration.glsl";
import PositionClipSpaceDeclaration from "./PositionClipSpaceDeclaration.glsl";
import normal_share from "./normal_share.glsl";
import uv_share from "./uv_share.glsl";
import worldpos_share from "./worldpos_share.glsl";

import begin_normal_vert from "./begin_normal_vert.glsl";
import begin_position_vert from "./begin_position_vert.glsl";

import blendShape_input from "./blendShape_input.glsl";
import blendShape_vert from "./blendShape_vert.glsl";
import color_vert from "./color_vert.glsl";
import FogVertex from "./FogVertex.glsl";
import normal_vert from "./normal_vert.glsl";
import position_vert from "./position_vert.glsl";
import skinning_vert from "./skinning_vert.glsl";
import uv_vert from "./uv_vert.glsl";
import worldpos_vert from "./worldpos_vert.glsl";

import FogFragment from "./FogFragment.glsl";
import PositionClipSpaceVertex from "./PositionClipSpaceVertex.glsl";
import light_frag_define from "./light_frag_define.glsl";
import mobile_material_frag from "./mobile_material_frag.glsl";

import begin_mobile_frag from "./begin_mobile_frag.glsl";
import begin_viewdir_frag from "./begin_viewdir_frag.glsl";

import mobile_blinnphong_frag from "./mobile_blinnphong_frag.glsl";

import noise_common from "./noise_common.glsl";
import noise_simplex_3D_grad from "./noise_simplex_3D_grad.glsl";

import PBRShaderLib from "./pbr";
import ShadowLib from "./shadow";
import ParticleShaderLib from "./particle";

import normal_get from "./normal_get.glsl";

export const ShaderLib = {
  common,
  common_vert,
  transform_declare,
  camera_declare,

  color_share,
  normal_share,
  uv_share,
  worldpos_share,
  FogVertexDeclaration,
  FogFragmentDeclaration,
  PositionClipSpaceDeclaration,

  begin_normal_vert,
  begin_position_vert,

  position_vert,
  color_vert,
  normal_vert,
  skinning_vert,
  blendShape_input,
  blendShape_vert,
  uv_vert,
  worldpos_vert,
  FogVertex,

  light_frag_define,
  mobile_material_frag,
  FogFragment,
  PositionClipSpaceVertex,

  begin_mobile_frag,
  begin_viewdir_frag,

  mobile_blinnphong_frag,

  noise_common,
  noise_simplex_3D_grad,

  ...ShadowLib,
  ...PBRShaderLib,
  normal_get,
  ...ParticleShaderLib
};
