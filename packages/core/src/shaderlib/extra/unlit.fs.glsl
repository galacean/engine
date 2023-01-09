#include <common>
#include <uv_share>
#include <FogFragmentDeclaration>

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

    gl_FragColor = baseColor;

    #ifndef OASIS_TRANSPARENT
        gl_FragColor.a = 1.0;
    #endif

    #include <FogFragment>

     #ifndef OASIS_COLORSPACE_GAMMA
        gl_FragColor = linearToGamma(gl_FragColor);
    #endif
}
