#include <common>
#include <common_frag>

uniform sampler2D s_diffuse;
varying vec2 v_uv;
varying vec3 v_pos;

uniform vec4 u_tintColor;
uniform float u_opacity;

void main()
{  

  gl_FragColor = texture2D(s_diffuse, v_uv);

}