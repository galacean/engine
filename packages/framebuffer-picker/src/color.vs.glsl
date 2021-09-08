#include <common>
#include <common_vert>
#include <blendShape_input>

#ifdef IS_SPRITE
    uniform mat4 u_VPMat;
#endif


void main() {

    #include <begin_position_vert>
    #include <begin_normal_vert>
    #include <blendShape_vert>
    #include <skinning_vert>
#ifdef IS_SPRITE
    gl_Position = u_VPMat * vec4(POSITION, 1.0);
#else
    gl_Position = u_MVPMat * position;
#endif
}
