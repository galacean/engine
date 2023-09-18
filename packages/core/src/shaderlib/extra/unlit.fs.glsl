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
        vec4 textureColor = texture2D(material_BaseTexture, v_uv);
        #ifndef ENGINE_IS_COLORSPACE_GAMMA
            textureColor = gammaToLinear(textureColor);
        #endif
        baseColor *= textureColor;
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

     #ifndef ENGINE_IS_COLORSPACE_GAMMA
        gl_FragColor = linearToGamma(gl_FragColor);
    #endif
}
