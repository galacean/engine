#include <common>

uniform sampler2D material_SpineTexture;
uniform float renderer_PremultipliedAlpha;

varying vec2 v_uv;
varying vec4 v_lightColor;

#ifdef RENDERER_TINT_BLACK
  varying vec3 v_darkColor;
#endif

void main()
{
  vec4 texColor = texture2D(material_SpineTexture, v_uv);
  vec4 lightColor = sRGBToLinear(v_lightColor);

  #ifdef RENDERER_TINT_BLACK
    vec4 darkColor = sRGBToLinear(vec4(v_darkColor, 1.0));
    vec3 dark_premult = (texColor.a - texColor.rgb) * darkColor.rgb;
    vec3 dark_nonpremult = (1.0 - texColor.rgb) * darkColor.rgb;
    vec3 dark = mix(dark_nonpremult, dark_premult, renderer_PremultipliedAlpha);
    vec3 light = texColor.rgb * lightColor.rgb;
    gl_FragColor.rgb = dark + light;
    gl_FragColor.a = texColor.a * lightColor.a;
  #else
    gl_FragColor = texColor * lightColor;
  #endif
}
