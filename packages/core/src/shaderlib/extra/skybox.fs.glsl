#include <common>
uniform samplerCube material_CubeTexture;

varying vec3 v_cubeUV;
uniform float material_Exposure;
uniform vec4 material_TintColor;

void main() {
    vec4 textureColor = textureCube( material_CubeTexture, v_cubeUV );

    #ifdef MATERIAL_IS_DECODE_SKY_RGBM
        textureColor = RGBMToLinear(textureColor, 5.0);
    #elif defined(ENGINE_NO_SRGB)
        textureColor = sRGBToLinear(textureColor);
    #endif

    textureColor.rgb *= material_Exposure * material_TintColor.rgb;
    
    gl_FragColor = outputTransform(textureColor);
}
