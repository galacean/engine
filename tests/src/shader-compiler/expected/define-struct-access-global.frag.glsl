varying vec2 v_uv;

uniform sampler2D u_texture;

#define ATTR_POS attr.POSITION


#define VARYING_UV o.v_uv


#define FRAG_UV v_uv

void main() { gl_FragColor = texture2D ( u_texture , FRAG_UV ) ; }
