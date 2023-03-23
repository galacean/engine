varying vec4 vColor;
varying vec2 v_uv;
uniform sampler2D u_texture;
void main(void)
{
  #ifdef trailTexture
    vec4 textureColor = texture2D(u_texture, v_uv);
    gl_FragColor = vColor * textureColor;
  #else
    gl_FragColor = vColor;
  #endif
}