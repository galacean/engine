#include <common>
uniform samplerCube u_cubeTexture;

varying vec3 v_cubeUV;
uniform float u_exposure;
uniform vec4 u_tintColor;

void main() {

    vec4 textureColor = textureCube( u_cubeTexture, v_cubeUV );

    #ifdef DECODE_SKY_RGBM
        textureColor = RGBMToLinear(textureColor, 5.0);
    #endif
    textureColor.rgb *= u_exposure * u_tintColor.rgb;
    
    #ifdef DECODE_SKY_RGBM
        textureColor = linearToGamma(textureColor);
    #endif
    gl_FragColor = textureColor;

}
