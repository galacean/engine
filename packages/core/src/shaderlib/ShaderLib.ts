import common from "./common.glsl";
import common_vert from "./common_vert.glsl";
import common_frag from "./common_frag.glsl";

import color_share from "./color_share.glsl";
import normal_share from "./normal_share.glsl";
import uv_share from "./uv_share.glsl";
import worldpos_share from "./worldpos_share.glsl";
import shadow_share from "./shadow_share.glsl";
import fog_share from "./fog_share.glsl";

import begin_normal_vert from "./begin_normal_vert.glsl";
import begin_position_vert from "./begin_position_vert.glsl";

import position_vert from "./position_vert.glsl";
import color_vert from "./color_vert.glsl";
import normal_vert from "./normal_vert.glsl";
import skinning_vert from "./skinning_vert.glsl";
import uv_vert from "./uv_vert.glsl";
import worldpos_vert from "./worldpos_vert.glsl";
import shadow_vert from "./shadow_vert.glsl";
import fog_vert from "./fog_vert.glsl";

import ambient_light_frag from "./ambient_light_frag.glsl";
import direct_light_frag from "./direct_light_frag.glsl";
import point_light_frag from "./point_light_frag.glsl";
import spot_light_frag from "./spot_light_frag.glsl";
import mobile_material_frag from "./mobile_material_frag.glsl";
import fog_frag from "./fog_frag.glsl";

import begin_mobile_frag from "./begin_mobile_frag.glsl";
import begin_normal_frag from "./begin_normal_frag.glsl";
import begin_viewdir_frag from "./begin_viewdir_frag.glsl";

import mobile_blinnphong_frag from "./mobile_blinnphong_frag.glsl";
import mobile_lambert_frag from "./mobile_lambert_frag.glsl";

import noise_common from "./noise_common.glsl";
import noise_cellular_2D from "./noise_cellular_2D.glsl";
import noise_cellular_2x2 from "./noise_cellular_2x2.glsl";
import noise_cellular_2x2x2 from "./noise_cellular_2x2x2.glsl";
import noise_cellular_3D from "./noise_cellular_3D.glsl";
import noise_cellular from "./noise_cellular.glsl";
import noise_perlin_2D from "./noise_perlin_2D.glsl";
import noise_perlin_3D from "./noise_perlin_3D.glsl";
import noise_perlin_4D from "./noise_perlin_4D.glsl";
import noise_perlin from "./noise_perlin.glsl";
import noise_psrd_2D from "./noise_psrd_2D.glsl";
import noise_simplex_2D from "./noise_simplex_2D.glsl";
import noise_simplex_3D_grad from "./noise_simplex_3D_grad.glsl";
import noise_simplex_3D from "./noise_simplex_3D.glsl";
import noise_simplex_4D from "./noise_simplex_4D.glsl";
import noise_simplex from "./noise_simplex.glsl";

import perturbation_share from "./perturbation_share.glsl";
import perturbation_frag from "./perturbation_frag.glsl";
import refraction_share from "./refraction_share.glsl";
import refraction_frag from "./refraction_frag.glsl";

import gamma_frag from "./gamma_frag.glsl";

import PBRShaderLib from "./pbr";
import oit_frag from "./oit/oit_frag.glsl";
import oit_frag_define from "./oit/oit_frag_define.glsl";

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

  position_vert,
  color_vert,
  normal_vert,
  skinning_vert,
  uv_vert,
  worldpos_vert,
  shadow_vert,
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

  gamma_frag,

  oit_frag,
  oit_frag_define,

  ...PBRShaderLib
};
