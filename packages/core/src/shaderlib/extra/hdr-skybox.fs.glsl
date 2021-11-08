uniform samplerCube u_cube;

varying vec3 v_cubeUV;

vec4 RGBMToLinear(vec4 value, float maxRange ) {
    return vec4( value.rgb * value.a * maxRange, 1.0 );
}

vec4 linearToGamma(vec4 linearIn){
    return vec4( pow(linearIn.rgb, vec3(1.0 / 2.2)), linearIn.a);
}

void main() {

    vec4 rgbm = textureCube( u_cube, v_cubeUV );
    vec4 linear = RGBMToLinear(rgbm, 5.0);
    gl_FragColor = linearToGamma(linear);
}