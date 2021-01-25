varying vec4 v_color;
varying float v_lifeLeft;
varying vec2 v_uv;
uniform sampler2D texture;
uniform sampler2D maskTexture;

void main() {
  float alphaFactor = 1.0;

  #ifdef fadeIn
    float fadeInFactor = step(0.5, v_lifeLeft);
    alphaFactor = 2.0 * fadeInFactor * (1.0 - v_lifeLeft) + (1.0 - fadeInFactor);
  #endif

  #ifdef fadeOut
    float fadeOutFactor = step(0.5, v_lifeLeft);
    alphaFactor = alphaFactor * 2.0 * (1.0 - fadeOutFactor) * v_lifeLeft + alphaFactor * fadeOutFactor;
  #endif

  #ifdef texture
    vec4 tex = texture2D(texture, v_uv);
    #ifdef useOriginColor
      gl_FragColor = vec4(tex.rgb, alphaFactor * tex.a * v_color.w);
    #else
      #ifdef maskTexture
        vec4 maskTex = texture2D( maskTexture, v_uv);
        gl_FragColor = vec4(v_color.xyz * tex.rgb + maskTex.a, alphaFactor * tex.a * v_color.w);
      #else
        gl_FragColor = vec4(v_color.xyz * tex.rgb, alphaFactor * tex.a * v_color.w);
      #endif
    #endif
  #else
    gl_FragColor = vec4( v_color.xyz, alphaFactor * v_color.w);
  #endif
}
