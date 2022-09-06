#include <common>
#include <uv_share>
#include <fog_share>
#include <shadow_frag_share>

uniform vec4 u_baseColor;
uniform float u_alphaCutoff;

#ifdef BASETEXTURE
    uniform sampler2D u_baseTexture;
#endif

void main() {
     vec4 baseColor = u_baseColor;

    #ifdef BASETEXTURE
        vec4 textureColor = texture2D(u_baseTexture, v_uv);
        #ifndef OASIS_COLORSPACE_GAMMA
            textureColor = gammaToLinear(textureColor);
        #endif
        baseColor *= textureColor;
    #endif

    #ifdef ALPHA_CUTOFF
        if( baseColor.a < u_alphaCutoff ) {
            discard;
        }
    #endif


    #ifndef OASIS_COLORSPACE_GAMMA
        baseColor = linearToGamma(baseColor);
    #endif

    gl_FragColor = baseColor;
    #include <shadow_frag>

    #include <fog_frag>
}
