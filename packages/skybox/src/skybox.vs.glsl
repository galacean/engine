#include <common_vert>

uniform mat4 u_mvpNoscale;

varying vec3 v_cubeUV;

void main() {

    v_cubeUV = a_position.xyz;
    gl_Position = u_mvpNoscale * vec4( a_position, 1.0 );
    gl_Position.z = gl_Position.w;

}
