#include <common>
#include <common_frag>

#include <uv_share>
#include <normal_share>
#include <color_share>
#include <worldpos_share>

#include <light_frag_define>
#include <mobile_material_frag>

#include <fog_share>
#include <normal_get>
#include <shadow_frag_share>

void main() {

    #include <begin_mobile_frag>
    #include <begin_viewdir_frag>
    #include <mobile_blinnphong_frag>

    gl_FragColor = emission + ambient + diffuse + specular;
    gl_FragColor.a = diffuse.a;

    #include <shadow_frag>

    #ifndef OASIS_COLORSPACE_GAMMA
        gl_FragColor = linearToGamma(gl_FragColor);
    #endif
    #include <fog_frag>

}
