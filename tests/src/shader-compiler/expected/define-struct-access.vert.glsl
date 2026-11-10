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
vec3 v_normal;
};
varying vec2 io_v_uv;
varying vec3 io_v_normal;
void write_Varyings(Varyings interface_value) {
io_v_uv = interface_value.v_uv;
io_v_normal = interface_value.v_normal;
}
Varyings vert ( Attributes attr ) { Varyings o ;

#define ATTR_POS attr.POSITION


#define VARYING_UV o.v_uv


#define VARYING_NORMAL o.v_normal

gl_Position = renderer_MVPMat * ATTR_POS ;
VARYING_UV = attr.TEXCOORD_0 ;
VARYING_NORMAL = vec3 ( 0.0 , 1.0 , 0.0 ) ;
return o ; }
void main() {

Attributes input_attr = read_Attributes();
write_Varyings(vert(input_attr)); }