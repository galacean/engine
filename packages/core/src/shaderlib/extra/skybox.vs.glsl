#include <common_vert>

varying vec3 v_cubeUV;
uniform float material_Rotation;

vec4 rotateY(vec4 v, float angle) {
	const float deg2rad = 3.1415926 / 180.0;
	float radian = angle * deg2rad;
	float sina = sin(radian);
	float cosa = cos(radian);
	mat2 m = mat2(cosa, -sina, sina, cosa);
	return vec4(m * v.xz, v.yw).xzyw;
}

void main() {
    v_cubeUV = POSITION;
    gl_Position = camera_VPMat * rotateY(vec4(POSITION, 1.0), material_Rotation);
}
