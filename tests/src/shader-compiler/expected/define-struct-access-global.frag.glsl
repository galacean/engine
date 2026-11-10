struct Varyings {
vec2 v_uv;
};
varying vec2 io_v_uv;
Varyings read_Varyings() { Varyings interface_value;
interface_value.v_uv = io_v_uv;
return interface_value; }
uniform sampler2D u_texture;

#define ATTR_POS attr.POSITION


#define VARYING_UV o.v_uv


#define FRAG_UV v.v_uv

void main() {

Varyings v = read_Varyings();
{ gl_FragColor = texture2D ( u_texture , FRAG_UV ) ; }
}