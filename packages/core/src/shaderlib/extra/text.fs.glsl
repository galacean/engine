#include <common>
uniform sampler2D renderElement_TextTexture;

varying vec2 v_uv;
varying vec4 v_color;

void main()
{
  float alpha = texture2D(renderElement_TextTexture, v_uv).a;
  gl_FragColor = v_color * alpha;
}
