#include <common>
#include <common_vert>
#include <uv_share>
#include <color_share>
#include <normal_share>
#include <worldpos_share>
#include <clipPlane_vert_define>
#include <morph_target_vert>

#include <fog_share>

void main() {

    #include <begin_position_vert>
    #include <begin_normal_vert>

    #include <morph_vert>
    #include <skinning_vert>
    #include <uv_vert>
    #include <color_vert>
    #include <normal_vert>
    #include <worldpos_vert>
    #include <clipPlane_vert>
    #include <position_vert>

    #include <fog_vert>
}
