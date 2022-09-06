#include <common_vert>
#include <blendShape_input>
#include <normal_share>
uniform mat4 u_lightViewMat;
uniform mat4 u_lightProjMat;

void main() {

    #include <begin_position_vert>
    #include <begin_normal_vert>
    #include <blendShape_vert>
    #include <skinning_vert>
    gl_Position = u_lightProjMat * u_lightViewMat * u_modelMat * position;

}
