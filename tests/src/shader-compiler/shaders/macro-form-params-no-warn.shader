Shader "macro-form-params-no-warn" {
  SubShader "Default" {
    Pass "test" {
      // Form params `a` / `mat` ref'd inside the value AST: must not warn.
      #define saturate( a ) clamp( a, 0.0, 1.0 )
      #define INVERSE_MAT(mat) inverseMat(mat)
      // Object-like macro used as a value: cross-arm probe must not warn.
      #define HALF_MIN 6.103515625e-5
      mat2 inverseMat(mat2 m) { return m; }
      void vert() { gl_Position = vec4(saturate(0.5)); }
      void frag() {
        float dp3 = max(float(HALF_MIN), 1.0);
        gl_FragColor = vec4(dp3);
      }
      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}
