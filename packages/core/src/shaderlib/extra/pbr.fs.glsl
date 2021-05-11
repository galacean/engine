#include <common>
#include <common_frag>
#include <pbr_common_frag_define>
#include <pbr_util_frag_define>

#include <fog_share>

#include <uv_share>
#include <normal_share>
#include <color_share>
#include <worldpos_share>
#include <refraction_share>
#include <perturbation_share>

// light
#include <direct_light_frag>
#include <point_light_frag>
#include <spot_light_frag>
#include <pbr_envmap_light_frag_define>

// prop & texture
#include <pbr_base_frag_define>
#include <pbr_texture_frag_define>

// runtime context
#include <pbr_runtime_frag_define>

#include <normal_get>

// todo: BxDF
#include <pbr_brdf_cook_torrance_frag_define>


// direct + indirect
#include <pbr_direct_irradiance_frag_define>
#include <pbr_ibl_diffuse_frag_define>
#include <pbr_ibl_specular_frag_define>

void main() {
    #include <pbr_begin_frag>
    #include <pbr_direct_irradiance_frag>
    #include <pbr_ibl_diffuse_frag>
    #include <pbr_ibl_specular_frag>
    // todo: generalize texture logic
    #include <pbr_end_frag>
    #include <gamma_frag>
    #include <refraction_frag>
    #include <perturbation_frag>
    #include <fog_frag>
}
