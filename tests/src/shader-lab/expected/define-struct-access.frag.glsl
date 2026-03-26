varying vec2 v_uv;
varying vec3 v_normal;

uniform sampler2D u_texture;
uniform vec3 u_lightDir;
void main() { #define FRAG_UV v_uv

#define FRAG_NORMAL v_normal

float NdotL = dot ( FRAG_NORMAL , u_lightDir ) ;
gl_FragColor = texture2D ( u_texture , FRAG_UV ) * NdotL ; }