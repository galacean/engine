precision mediump float;
precision mediump int;

uniform sampler2D u_spriteTexture;
varying vec2 v_uv;
varying vec4 v_color;

void main()
{
  // Only use the Alpha of the texture as a mask, so that the tint color can still be controlled to fade out.
  vec4 baseColor = texture2D(u_spriteTexture, v_uv);
  gl_FragColor = baseColor * v_color;
}