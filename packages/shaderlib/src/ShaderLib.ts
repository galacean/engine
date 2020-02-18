import common from "./shaderlib/common.glsl";
import common_vert from "./shaderlib/common_vert.glsl";
import common_frag from "./shaderlib/common_frag.glsl";

import color_share from "./shaderlib/color_share.glsl";
import normal_share from "./shaderlib/normal_share.glsl";
import uv_share from "./shaderlib/uv_share.glsl";
import worldpos_share from "./shaderlib/worldpos_share.glsl";
import shadow_share from "./shaderlib/shadow_share.glsl";
import fog_share from "./shaderlib/fog_share.glsl";

import begin_normal_vert from "./shaderlib/begin_normal_vert.glsl";
import begin_position_vert from "./shaderlib/begin_position_vert.glsl";

import morph_target_vert from "./shaderlib/morph_target_vert.glsl";

import position_vert from "./shaderlib/position_vert.glsl";
import color_vert from "./shaderlib/color_vert.glsl";
import normal_vert from "./shaderlib/normal_vert.glsl";
import skinning_vert from "./shaderlib/skinning_vert.glsl";
import uv_vert from "./shaderlib/uv_vert.glsl";
import worldpos_vert from "./shaderlib/worldpos_vert.glsl";
import shadow_vert from "./shaderlib/shadow_vert.glsl";
import morph_vert from "./shaderlib/morph_vert.glsl";
import fog_vert from "./shaderlib/fog_vert.glsl";

import ambient_light_frag from "./shaderlib/ambient_light_frag.glsl";
import direct_light_frag from "./shaderlib/direct_light_frag.glsl";
import point_light_frag from "./shaderlib/point_light_frag.glsl";
import spot_light_frag from "./shaderlib/spot_light_frag.glsl";
import mobile_material_frag from "./shaderlib/mobile_material_frag.glsl";
import fog_frag from "./shaderlib/fog_frag.glsl";

import begin_mobile_frag from "./shaderlib/begin_mobile_frag.glsl";
import begin_normal_frag from "./shaderlib/begin_normal_frag.glsl";
import begin_viewdir_frag from "./shaderlib/begin_viewdir_frag.glsl";

import mobile_blinnphong_frag from "./shaderlib/mobile_blinnphong_frag.glsl";
import mobile_lambert_frag from "./shaderlib/mobile_lambert_frag.glsl";

import noise_common from "./shaderlib/noise_common.glsl";
import noise_cellular_2D from "./shaderlib/noise_cellular_2D.glsl";
import noise_cellular_2x2 from "./shaderlib/noise_cellular_2x2.glsl";
import noise_cellular_2x2x2 from "./shaderlib/noise_cellular_2x2x2.glsl";
import noise_cellular_3D from "./shaderlib/noise_cellular_3D.glsl";
import noise_cellular from "./shaderlib/noise_cellular.glsl";
import noise_perlin_2D from "./shaderlib/noise_perlin_2D.glsl";
import noise_perlin_3D from "./shaderlib/noise_perlin_3D.glsl";
import noise_perlin_4D from "./shaderlib/noise_perlin_4D.glsl";
import noise_perlin from "./shaderlib/noise_perlin.glsl";
import noise_psrd_2D from "./shaderlib/noise_psrd_2D.glsl";
import noise_simplex_2D from "./shaderlib/noise_simplex_2D.glsl";
import noise_simplex_3D_grad from "./shaderlib/noise_simplex_3D_grad.glsl";
import noise_simplex_3D from "./shaderlib/noise_simplex_3D.glsl";
import noise_simplex_4D from "./shaderlib/noise_simplex_4D.glsl";
import noise_simplex from "./shaderlib/noise_simplex.glsl";

import perturbation_share from "./shaderlib/perturbation_share.glsl";
import perturbation_frag from "./shaderlib/perturbation_frag.glsl";
import refraction_share from "./shaderlib/refraction_share.glsl";
import refraction_frag from "./shaderlib/refraction_frag.glsl";

import uv_transform_share_define from "./shaderlib/uv_transform_share_define.glsl";
import uv_transform_vert_define from "./shaderlib/uv_transform_vert_define.glsl";
import uv_transform_vert from "./shaderlib/uv_transform_vert.glsl";

import clipPlane_vert_define from "./shaderlib/clipPlane_vert_define.glsl";
import clipPlane_vert from "./shaderlib/clipPlane_vert.glsl";
import clipPlane_frag_define from "./shaderlib/clipPlane_frag_define.glsl";
import clipPlane_frag from "./shaderlib/clipPlane_frag.glsl";

import gamma_frag from "./shaderlib/gamma_frag.glsl";

export const ShaderLib = {
  common,
  common_vert,
  common_frag,

  color_share,
  normal_share,
  uv_share,
  worldpos_share,
  shadow_share,
  fog_share,

  begin_normal_vert,
  begin_position_vert,

  morph_target_vert,

  position_vert,
  color_vert,
  normal_vert,
  skinning_vert,
  uv_vert,
  worldpos_vert,
  shadow_vert,
  morph_vert,
  fog_vert,

  ambient_light_frag,
  direct_light_frag,
  point_light_frag,
  spot_light_frag,
  mobile_material_frag,
  fog_frag,

  begin_mobile_frag,
  begin_normal_frag,
  begin_viewdir_frag,

  mobile_blinnphong_frag,
  mobile_lambert_frag,

  noise_common,
  noise_cellular_2D,
  noise_cellular_2x2,
  noise_cellular_2x2x2,
  noise_cellular_3D,
  noise_cellular,
  noise_perlin_2D,
  noise_perlin_3D,
  noise_perlin_4D,
  noise_perlin,
  noise_psrd_2D,
  noise_simplex_2D,
  noise_simplex_3D_grad,
  noise_simplex_3D,
  noise_simplex_4D,
  noise_simplex,

  perturbation_share,
  perturbation_frag,
  refraction_share,
  refraction_frag,

  uv_transform_share_define,
  uv_transform_vert_define,
  uv_transform_vert,

  clipPlane_vert_define,
  clipPlane_vert,
  clipPlane_frag_define,
  clipPlane_frag,

  gamma_frag
};

export function InjectShaderSlices(obj) {
  Object.assign(ShaderLib, obj);
}
