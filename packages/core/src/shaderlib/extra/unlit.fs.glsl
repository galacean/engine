#include <uv_share>
#include <fog_share>

uniform vec4 u_baseColor;

#ifdef O3_BASECOLOR_TEXTURE
    uniform sampler2D u_baseColorTexture;
#endif

void main() {
     vec4 baseColor = u_baseColor;

    #ifdef O3_BASECOLOR_TEXTURE
        baseColor *= texture2D(u_baseColorTexture, v_uv);
    #endif

    gl_FragColor = baseColor;

    #include <fog_frag>
}
