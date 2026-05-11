uniform mat4 renderer_MVPMat;
attribute vec4 POSITION;
attribute vec2 TEXCOORD_0;

varying vec2 v_uv;
varying vec3 v_normal;

void main() { 

#define ATTR_POS POSITION


#define VARYING_UV v_uv


#define VARYING_NORMAL v_normal

gl_Position = renderer_MVPMat * ATTR_POS ;
VARYING_UV = TEXCOORD_0 ;
VARYING_NORMAL = vec3 ( 0.0 , 1.0 , 0.0 ) ;
 }