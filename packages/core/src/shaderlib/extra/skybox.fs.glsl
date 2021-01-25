uniform samplerCube u_cube;

varying vec3 v_cubeUV;

void main() {

    gl_FragColor = textureCube( u_cube, v_cubeUV );

}
