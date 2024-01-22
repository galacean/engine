import attr_blendShape_input from "./attr_blendShape_input.gsl?raw";
import attr_common_vert from "./attr_common_vert.gsl?raw";
import attrib from "./attrib.gsl?raw";
import begin_normal_vert from "./begin_normal_vert.gsl?raw";
import begin_position_vert from "./begin_position_vert.gsl?raw";
import blendShape_input from "./blendShape_input.gsl?raw";
import blendShape_vert from "./blendShape_vert.gsl?raw";
import brdf from "./brdf.gsl?raw";
import camera_declare from "./camera_declare.gsl?raw";
import color_vert from "./color_vert.gsl?raw";
import common_vert from "./common_vert.gsl?raw";
import common from "./common.gsl?raw";
import direct_irradiance_frag_define from "./direct_irradiance_frag_define.gsl?raw";
import FogFragment from "./FogFragment.gsl?raw";
import FogFragmentDeclaration from "./FogFragmentDeclaration.gsl?raw";
import FogVertex from "./FogVertex.gsl?raw";
import ibl_frag_define from "./ibl_frag_define.gsl?raw";
import light_frag_define from "./light_frag_define.gsl?raw";
import normal_get from "./normal_get.gsl?raw";
import normal_vert from "./normal_vert.gsl?raw";
import pbr_frag_define from "./pbr_frag_define.gsl?raw";
import pbr_frag from "./pbr_frag.gsl?raw";
import pbr_helper from "./pbr_helper.gsl?raw";
import position_vert from "./position_vert.gsl?raw";
import shadow_sample_tent from "./shadow_sample_tent.gsl?raw";
import ShadowCoord from "./ShadowCoord.gsl?raw";
import ShadowFragmentDeclaration from "./ShadowFragmentDeclaration.gsl?raw";
import ShadowVertex from "./ShadowVertex.gsl?raw";
import ShadowVertexDeclaration from "./ShadowVertexDeclaration.gsl?raw";
import skinning_vert from "./skinning_vert.gsl?raw";
import transform_declare from "./transform_declare.gsl?raw";
import uv_vert from "./uv_vert.gsl?raw";
import vary_color_share from "./vary_color_share.gsl?raw";
import vary_FogVertexDeclaration from "./vary_FogVertexDeclaration.gsl?raw";
import vary_normal_share from "./vary_normal_share.gsl?raw";
import vary_ShadowVertexDeclaration from "./vary_ShadowVertexDeclaration.gsl?raw";
import vary_uv_share from "./vary_uv_share.gsl?raw";
import vary_worldpos_share from "./vary_worldpos_share.gsl?raw";
import varying from "./varying.gsl?raw";
import worldpos_vert from "./worldpos_vert.gsl?raw";

export const pbr_include_fragment_list = {
  attr_blendShape_input,
  attr_common_vert,
  attrib,
  begin_normal_vert,
  begin_position_vert,
  blendShape_input,
  blendShape_vert,
  brdf,
  camera_declare,
  color_vert,
  common_vert,
  common,
  direct_irradiance_frag_define,
  FogFragment,
  FogFragmentDeclaration,
  FogVertex,
  ibl_frag_define,
  light_frag_define,
  normal_get,
  normal_vert,
  pbr_frag_define,
  pbr_frag,
  pbr_helper,
  position_vert,
  shadow_sample_tent,
  ShadowCoord,
  ShadowFragmentDeclaration,
  ShadowVertex,
  ShadowVertexDeclaration,
  skinning_vert,
  transform_declare,
  uv_vert,
  vary_color_share,
  vary_FogVertexDeclaration,
  vary_normal_share,
  vary_ShadowVertexDeclaration,
  vary_uv_share,
  vary_worldpos_share,
  varying,
  worldpos_vert
};
