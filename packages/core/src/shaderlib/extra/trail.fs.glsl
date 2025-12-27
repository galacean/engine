#include <common>

varying vec2 v_uv;
varying vec4 v_color;

uniform vec4 material_BaseColor;

#ifdef MATERIAL_HAS_BASETEXTURE
    uniform sampler2D material_BaseTexture;
#endif

uniform mediump vec3 material_EmissiveColor;
#ifdef MATERIAL_HAS_EMISSIVETEXTURE
    uniform sampler2D material_EmissiveTexture;
#endif

void main() {
    vec4 color = material_BaseColor * v_color;

    #ifdef MATERIAL_HAS_BASETEXTURE
        color *= texture2DSRGB(material_BaseTexture, v_uv);
    #endif

    // Emissive
    vec3 emissiveRadiance = material_EmissiveColor;
    #ifdef MATERIAL_HAS_EMISSIVETEXTURE
        emissiveRadiance *= texture2DSRGB(material_EmissiveTexture, v_uv).rgb;
    #endif

    color.rgb += emissiveRadiance;

    gl_FragColor = color;
}

