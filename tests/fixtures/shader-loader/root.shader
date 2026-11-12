Shader "ShaderLoaderAbsoluteURL-root" {
  SubShader "s" { Pass "p" {
    void vert() { gl_Position = vec4(0.0); }
    void frag() { gl_FragColor = vec4(1.0); }
    VertexShader = vert;
    FragmentShader = frag;
  } }
}
