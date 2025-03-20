#include <common>
uniform sampler2D renderElement_TextTexture;

varying vec2 v_uv;
varying vec4 v_color;

void main()
{
  vec4 baseColor = texture2D_SRGB(renderElement_TextTexture, v_uv);
  gl_FragColor = linearToGamma(baseColor * v_color);
}
