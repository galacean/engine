#include <common>
#include <common_frag>
#include <uv_transform_share_declaration>

uniform sampler2D u_diffuse;
varying vec3 v_pos;
uniform vec4 u_tintColor;
uniform float u_opacity;

void main()
{
  #ifdef O3_DIFFUSE_TEXTURE
    gl_FragColor = texture2D(u_diffuse, v_uv_diffuseTexture);
  #else
    gl_FragColor = vec4(1);
  #endif
}
