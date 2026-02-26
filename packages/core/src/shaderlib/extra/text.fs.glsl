uniform sampler2D renderElement_TextTexture;

varying vec2 v_uv;
varying vec4 v_color;

void main()
{
  vec4 texColor = texture2D(renderElement_TextTexture, v_uv);
  #ifdef GRAPHICS_API_WEBGL2
    float coverage = texColor.r;
  #else
    float coverage = texColor.a;
  #endif
  gl_FragColor = vec4(v_color.rgb, v_color.a * coverage);
}
