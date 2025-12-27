#include <common>

varying vec2 v_uv;
varying vec4 v_color;

uniform vec4 material_BaseColor;

#ifdef MATERIAL_HAS_BASETEXTURE
    uniform sampler2D material_BaseTexture;
#endif

void main() {
    vec4 baseColor = material_BaseColor * v_color;

    #ifdef MATERIAL_HAS_BASETEXTURE
        baseColor *= texture2DSRGB(material_BaseTexture, v_uv);
    #endif

    gl_FragColor = baseColor;
}

