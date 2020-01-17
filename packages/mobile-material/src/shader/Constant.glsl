#include <common>
#include <common_frag>
#include <uv_share>
#include <uv_transform_share_declaration>
#include <mobile_material_frag>

#include <fog_share>

void main() {

    #include <begin_mobile_frag>

    gl_FragColor = emission + ambient;

    #include <fog_frag>

}
