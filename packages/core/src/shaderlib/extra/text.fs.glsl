uniform sampler2D renderElement_TextTexture;

varying vec2 v_uv;
varying vec4 v_color;

void main()
{
  vec4 texColor = texture2D(renderElement_TextTexture, v_uv);
  #ifdef GRAPHICS_API_WEBGL2
    float alpha = texColor.r;
  #else
    float alpha = texColor.a;
  #endif
  gl_FragColor = v_color * alpha;
}
