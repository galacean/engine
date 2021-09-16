import pbr_frag_define from "./pbr_frag_define.glsl";

// todo: BxDF
import pbr_brdf from "./pbr_brdf.glsl";

/** direct + IBL */
import pbr_helper from "./pbr_helper.glsl";
import pbr_direct_irradiance_frag_define from "./direct_irradiance_frag_define.glsl";
import pbr_ibl_diffuse_frag_define from "./ibl_diffuse_frag_define.glsl";
import pbr_ibl_specular_frag_define from "./ibl_specular_frag_define.glsl";

import pbr_begin_frag from "./begin_frag.glsl";
import pbr_direct_irradiance_frag from "./direct_irradiance_frag.glsl";
import pbr_ibl_diffuse_frag from "./ibl_diffuse_frag.glsl";
import pbr_ibl_specular_frag from "./ibl_specular_frag.glsl";
import pbr_end_frag from "./end_frag.glsl";


export default {
  pbr_frag_define,
  pbr_brdf,

  pbr_direct_irradiance_frag_define,
  pbr_ibl_specular_frag_define,
  pbr_ibl_diffuse_frag_define,

  pbr_begin_frag,
  pbr_direct_irradiance_frag,
  pbr_ibl_diffuse_frag,
  pbr_ibl_specular_frag,
  pbr_end_frag,
  pbr_helper
};
