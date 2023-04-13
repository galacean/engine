uniform sampler2D renderer_MaskTexture;
uniform float renderer_MaskAlphaCutoff;
varying vec2 v_uv;

void main()
{
  vec4 color = texture2D(renderer_MaskTexture, v_uv);
  if (color.a < renderer_MaskAlphaCutoff) {
    discard;
  }

  gl_FragColor = color;
}
