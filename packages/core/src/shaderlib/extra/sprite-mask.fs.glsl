precision mediump float;
precision mediump int;

uniform sampler2D u_maskTexture;
uniform float u_alphaCutoff;
varying vec2 v_uv;

void main()
{
  vec4 color = texture2D(u_maskTexture, v_uv);
  if (color.a < u_alphaCutoff) {
    discard;
  }

  gl_FragColor = color;
}