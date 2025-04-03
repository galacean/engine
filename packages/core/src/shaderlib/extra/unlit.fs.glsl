#include <common>
#include <uv_share>
#include <FogFragmentDeclaration>

uniform vec4 material_BaseColor;
uniform float material_AlphaCutoff;

#ifdef MATERIAL_HAS_BASETEXTURE
    uniform sampler2D material_BaseTexture;
#endif

void main() {
     vec4 baseColor = material_BaseColor;

    #ifdef MATERIAL_HAS_BASETEXTURE
        baseColor *= texture2D_SRGB(material_BaseTexture, v_uv);
    #endif

    #ifdef MATERIAL_IS_ALPHA_CUTOFF
        if( baseColor.a < material_AlphaCutoff ) {
            discard;
        }
    #endif

    gl_FragColor = baseColor;

    #ifndef MATERIAL_IS_TRANSPARENT
        gl_FragColor.a = 1.0;
    #endif

    #include <FogFragment>

    gl_FragColor = outputTransform(gl_FragColor);
}
