import pbr_common_frag_define from "./common_frag_define.glsl";
import pbr_util_frag_define from "./util_frag_define.glsl";

/** IBL define */
import pbr_envmap_light_frag_define from "./envmap_light_frag_define.glsl";

/** prop & texture */
import pbr_base_frag_define from "./base_frag_define.glsl";
import pbr_texture_frag_define from "./texture_frag_define.glsl";

/** runtime context */
import pbr_runtime_frag_define from "./runtime_frag_define.glsl";

// todo: generalize
import pbr_normal_frag_define from "./normal_frag_define.glsl";

// todo: BxDF
import pbr_brdf_cook_torrance_frag_define from "./brdf_cook_torrance_frag_define.glsl";

/** direct + IBL */
import pbr_direct_irradiance_frag_define from "./direct_irradiance_frag_define.glsl";
import pbr_ibl_specular_frag_define from "./ibl_specular_frag_define.glsl";
import pbr_ibl_diffuse_frag_define from "./ibl_diffuse_frag_define.glsl";

import pbr_begin_frag from "./begin_frag.glsl";
import pbr_direct_irradiance_frag from "./direct_irradiance_frag.glsl";
import pbr_ibl_diffuse_frag from "./ibl_diffuse_frag.glsl";
import pbr_ibl_specular_frag from "./ibl_specular_frag.glsl";
import pbr_end_frag from "./end_frag.glsl";

export default {
  pbr_common_frag_define,
  pbr_util_frag_define,

  pbr_envmap_light_frag_define,

  pbr_base_frag_define,
  pbr_texture_frag_define,

  pbr_runtime_frag_define,

  pbr_normal_frag_define,

  pbr_brdf_cook_torrance_frag_define,

  pbr_direct_irradiance_frag_define,
  pbr_ibl_specular_frag_define,
  pbr_ibl_diffuse_frag_define,

  pbr_begin_frag,
  pbr_direct_irradiance_frag,
  pbr_ibl_diffuse_frag,
  pbr_ibl_specular_frag,
  pbr_end_frag
};
