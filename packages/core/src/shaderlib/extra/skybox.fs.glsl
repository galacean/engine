#include <common>
uniform samplerCube u_cubeTexture;

varying vec3 v_cubeUV;
uniform float u_exposure;
uniform vec4 u_tintColor;

void main() {
    vec4 textureColor = textureCube( u_cubeTexture, v_cubeUV );

    #ifdef DECODE_SKY_RGBM
        textureColor = RGBMToLinear(textureColor, 5.0);
    #elif !defined(GALACEAN_COLORSPACE_GAMMA)
        textureColor = gammaToLinear(textureColor);
    #endif

    textureColor.rgb *= u_exposure * u_tintColor.rgb;

    #if defined(DECODE_SKY_RGBM) || !defined(GALACEAN_COLORSPACE_GAMMA)
        gl_FragColor = linearToGamma(gl_FragColor);
    #endif
}
