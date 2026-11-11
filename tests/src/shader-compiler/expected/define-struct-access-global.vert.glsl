uniform mat4 renderer_MVPMat;
struct Attributes {
vec4 POSITION;
vec2 TEXCOORD_0;
};
attribute vec4 POSITION;
attribute vec2 TEXCOORD_0;
Attributes read_Attributes() { Attributes interface_value;
interface_value.POSITION = POSITION;
interface_value.TEXCOORD_0 = TEXCOORD_0;
return interface_value; }
struct Varyings {
vec2 v_uv;
};
varying vec2 v_uv;
void write_Varyings(Varyings interface_value) {
v_uv = interface_value.v_uv;
}

#define ATTR_POS attr.POSITION


#define VARYING_UV o.v_uv


#define FRAG_UV v.v_uv

Varyings vert ( Attributes attr ) { Varyings o ;
gl_Position = renderer_MVPMat * ATTR_POS ;
VARYING_UV = attr.TEXCOORD_0 ;
return o ; }
void main() {

Attributes input_attr = read_Attributes();
write_Varyings(vert(input_attr)); }