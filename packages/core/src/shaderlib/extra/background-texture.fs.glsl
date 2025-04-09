#include <common>
uniform sampler2D material_BaseTexture;

varying vec2 v_uv;

void main() {
  gl_FragColor = texture2DSRGB(material_BaseTexture, v_uv);
  gl_FragColor = outputSRGBCorrection(gl_FragColor);
}