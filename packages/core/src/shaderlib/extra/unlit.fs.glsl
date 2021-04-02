#include <uv_share>
#include <fog_share>

uniform vec4 u_baseColor;
uniform float u_alphaCutoff;

#ifdef O3_BASE_TEXTURE
    uniform sampler2D u_baseTexture;
#endif

void main() {
     vec4 baseColor = u_baseColor;

    #ifdef O3_BASE_TEXTURE
        baseColor *= texture2D(u_baseTexture, v_uv);
    #endif

    #ifdef ALPHA_CUTOFF
        if( baseColor.a < u_alphaCutoff ) {
            discard;
        }
    #endif

    gl_FragColor = baseColor;

    #include <fog_frag>
}
