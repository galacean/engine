uniform samplerCube u_cube;

varying vec3 v_cubeUV;


vec4 RGBEToLinear(vec4 value) {
    return vec4( step(0.0, value.a) * value.rgb * exp2( value.a * 255.0 - 128.0 ), 1.0 );
}

vec4 RGBMToLinear(vec4 value, float maxRange ) {
    return vec4( value.rgb * value.a * maxRange, 1.0 );
}

vec4 gammaToLinear(vec4 srgbIn){
    return vec4( pow(srgbIn.rgb, vec3(2.2)), srgbIn.a);
}


vec4 toLinear(vec4 color){
    vec4 linear;
    #if (DECODE_MODE == 1)
        linear = color;
    #elif (DECODE_MODE == 2)
        linear = gammaToLinear(color);
    #elif (DECODE_MODE == 3)
        linear = RGBEToLinear(color);
    #elif (DECODE_MODE == 4)
        linear = RGBMToLinear(color, 5.0);
    #endif

    return linear;
}

vec4 linearToGamma(vec4 linearIn){
    return vec4( pow(linearIn.rgb, vec3(1.0 / 2.2)), linearIn.a);
}

void main() {
    vec4 textureColor = toLinear(textureCube( u_cube, v_cubeUV ));

    gl_FragColor = linearToGamma(textureColor);


}
