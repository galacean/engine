#include <common>
#include <common_frag>

#include <uv_share>
#include <normal_share>
#include <color_share>
#include <worldpos_share>

#include <pbr_envmap_light_frag_define>
#include <direct_light_frag>
#include <point_light_frag>
#include <spot_light_frag>
#include <mobile_material_frag>

#include <fog_share>
#include <normal_get>


void main() {

    #include <begin_mobile_frag>
    #include <begin_viewdir_frag>
    #include <mobile_blinnphong_frag>

    gl_FragColor = emission + ambient + diffuse + specular;
    gl_FragColor.a = diffuse.a;

    #include <fog_frag>

}
