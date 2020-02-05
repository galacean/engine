#include <common>
#include <common_frag>
#include <uv_share>
#include <normal_share>

#include <direct_light_frag>
#include <mobile_material_frag>

#include <fog_share>

void main() {

    #include <begin_mobile_frag>
    #include <begin_normal_frag>
    #include <mobile_lambert_frag>

    gl_FragColor = emission + ambient + diffuse;

    #include <fog_frag>

}
