#include <common>
uniform samplerCube material_CubeTexture;

varying vec3 v_cubeUV;
uniform float material_Exposure;
uniform vec4 material_TintColor;

void main() {
    vec4 textureColor = textureCube( material_CubeTexture, v_cubeUV );

    #ifdef ENGINE_NO_SRGB
        textureColor = sRGBToLinear(textureColor);
    #endif

    textureColor.rgb *= material_Exposure * material_TintColor.rgb;
    
    gl_FragColor = textureColor;
}
