uniform sampler2D renderElement_TextTexture;

varying vec2 v_uv;
varying vec4 v_color;

void main()
{
  vec4 baseColor = texture2D(renderElement_TextTexture, v_uv);
  gl_FragColor = baseColor * v_color;
}
