void main() {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
#ifdef OASIS_NO_DEPTH_TEXTURE
    gl_FragColor = vec4(gl_FragCoord.z, 0.0, 0.0, 0.0);
#endif
}