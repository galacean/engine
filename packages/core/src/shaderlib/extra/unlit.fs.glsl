#include <uv_share>
#include <fog_share>

uniform vec4 u_baseColor;
uniform float u_alphaCutoff;

#ifdef O3_BASE_TEXTURE
    uniform sampler2D u_baseTexture;
#endif

vec4 gammaToLinear(vec4 srgbIn){
    return vec4( pow(srgbIn.rgb, vec3(2.2)), srgbIn.a);
}

vec4 linearToGamma(vec4 linearIn){
    return vec4( pow(linearIn.rgb, vec3(1.0 / 2.2)), linearIn.a);
}

void main() {
     vec4 baseColor = u_baseColor;

    #ifdef O3_BASE_TEXTURE
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

    #include <fog_frag>
}
