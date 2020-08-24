#include <common>
#include <common_frag>
#include <uv_share>
#include <mobile_material_frag>

#include <fog_share>
#include <ambient_light_frag>

void main() {

    #include <begin_mobile_frag>

    gl_FragColor = emission + ambient;

    #include <fog_frag>

}
