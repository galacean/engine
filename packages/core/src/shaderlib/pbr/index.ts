import pbr_frag_define from "./pbr_frag_define.glsl";

/** direct + IBL */
import pbr_helper from "./pbr_helper.glsl";
import pbr_direct_irradiance_frag_define from "./direct_irradiance_frag_define.glsl";
import pbr_ibl_diffuse_frag_define from "./ibl_diffuse_frag_define.glsl";
import pbr_ibl_specular_frag_define from "./ibl_specular_frag_define.glsl";
// todo: BxDF
import pbr_brdf from "./pbr_brdf.glsl";

import pbr_direct_irradiance_frag from "./direct_irradiance_frag.glsl";
import pbr_frag from "./pbr_frag.glsl";

export default {
  pbr_frag_define,

  pbr_helper,
  pbr_brdf,
  pbr_direct_irradiance_frag_define,
  pbr_ibl_specular_frag_define,
  pbr_ibl_diffuse_frag_define,

  pbr_direct_irradiance_frag,

  pbr_frag
};
