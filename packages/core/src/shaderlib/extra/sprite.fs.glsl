precision mediump float;
precision mediump int;

#ifdef USE_CUSTOM_TEXTURE
uniform sampler2D u_cusTomTexture;
#else
uniform sampler2D u_spriteTexture;
#endif

varying vec2 v_uv;
varying vec4 v_color;

void main()
{
  // Only use the Alpha of the texture as a mask, so that the tint color can still be controlled to fade out.
  #ifdef USE_CUSTOM_TEXTURE
  vec4 baseColor = texture2D(u_cusTomTexture, v_uv);
  #else
  vec4 baseColor = texture2D(u_spriteTexture, v_uv);
  #endif
  gl_FragColor = baseColor * v_color;
}