#include <common>
#include <common_frag>
#include <pbr_util_frag_define>

#include <fog_share>

#include <uv_share>
#include <normal_share>
#include <color_share>
#include <worldpos_share>

// light
#include <light_frag>

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
    #include <pbr_end_frag>
    #include <gamma_frag>
    #include <fog_frag>
}
