uniform mat4 renderer_MVPMat;
attribute vec4 POSITION;
attribute vec2 TEXCOORD_0;

varying vec2 v_uv;

#define ATTR_POS POSITION

#define VARYING_UV v_uv

#define FRAG_UV v_uv

void main() { 
gl_Position = renderer_MVPMat * ATTR_POS ;
VARYING_UV = TEXCOORD_0 ;
 }