#include <common>
uniform samplerCube u_cube;

varying vec3 v_cubeUV;
uniform vec4 u_cubeDecodeParam;

void main() {
    vec3 reflectionDir = vec3(-v_cubeUV.x, v_cubeUV.yz);
    vec4 textureColor = textureCube( u_cube, reflectionDir );

    if (u_cubeDecodeParam.x > 0.0){
       textureColor = RGBMToLinear(textureColor, u_cubeDecodeParam.y);
       textureColor = linearToGamma(textureColor);
    }
      

    gl_FragColor = textureColor;

}
