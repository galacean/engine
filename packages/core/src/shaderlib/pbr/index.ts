import pbr_frag_define from "./pbr_frag_define.glsl";

/** direct + IBL */
import pbr_helper from "./pbr_helper.glsl";
import direct_irradiance_frag_define from "./direct_irradiance_frag_define.glsl";
import ibl_diffuse_frag_define from "./ibl_diffuse_frag_define.glsl";
import ibl_specular_frag_define from "./ibl_specular_frag_define.glsl";
// todo: BxDF
import brdf from "./brdf.glsl";

import direct_irradiance_frag from "./direct_irradiance_frag.glsl";
import pbr_frag from "./pbr_frag.glsl";

export default {
  pbr_frag_define,

  pbr_helper,
  brdf,
  direct_irradiance_frag_define,
  ibl_specular_frag_define,
  ibl_diffuse_frag_define,

  direct_irradiance_frag,

  pbr_frag
};
