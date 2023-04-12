uniform sampler2D galacean_MaskTexture;
uniform float galacean_MaskAlphaCutoff;
varying vec2 v_uv;

void main()
{
  vec4 color = texture2D(galacean_MaskTexture, v_uv);
  if (color.a < galacean_MaskAlphaCutoff) {
    discard;
  }

  gl_FragColor = color;
}
