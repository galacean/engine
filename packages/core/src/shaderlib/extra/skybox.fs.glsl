uniform samplerCube u_cube;

varying vec3 v_cubeUV;

vec4 RGBEToLinear(vec4 value) {
    return vec4( step(0.0, value.a) * value.rgb * exp2( value.a * 255.0 - 128.0 ), 1.0 );
}


void main() {

    gl_FragColor = textureCube( u_cube, v_cubeUV );

    #ifdef MAP_RGBE
        gl_FragColor = RGBEToLinear( gl_FragColor);
        #include <gamma_frag>
    #elif defined(MAP_LINEAR)
        #include <gamma_frag>
    #endif
    
}
