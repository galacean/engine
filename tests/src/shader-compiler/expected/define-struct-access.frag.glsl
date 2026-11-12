struct Varyings {
vec2 v_uv;
vec3 v_normal;
};
varying vec2 v_uv;
varying vec3 v_normal;
Varyings read_Varyings() { Varyings interface_value;
interface_value.v_uv = v_uv;
interface_value.v_normal = v_normal;
return interface_value; }
uniform sampler2D u_texture;
uniform vec3 u_lightDir;
void frag ( Varyings v ) {
#define FRAG_UV v.v_uv


#define FRAG_NORMAL v.v_normal

float NdotL = dot ( FRAG_NORMAL , u_lightDir ) ;
gl_FragColor = texture2D ( u_texture , FRAG_UV ) * NdotL ; }
void main() {

Varyings input_v = read_Varyings();
frag(input_v); }