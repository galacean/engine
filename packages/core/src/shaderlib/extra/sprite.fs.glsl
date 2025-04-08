#include <common>
uniform sampler2D renderer_SpriteTexture;

varying vec2 v_uv;
varying vec4 v_color;

void main()
{
  vec4 baseColor = texture2DSRGB(renderer_SpriteTexture, v_uv);
  gl_FragColor = outputSRGBCorrection(baseColor * v_color);
}
