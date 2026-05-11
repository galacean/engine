Shader "numeric-literals" {
  SubShader "Default" {
    Pass "test" {
      mat4 renderer_MVPMat;

      struct Attributes {
        vec3 POSITION;
      };

      void vert(Attributes attr) {
        // Decimal integer
        int dec1 = 42;
        int dec2 = 0;
        // Decimal + uint suffix
        uint udec1 = 123u;
        uint udec2 = 5U;
        // Hex integer
        int hex1 = 0xFF;
        // Hex + uint suffix
        uint uhex1 = 0xFFu;
        uint uhex2 = 0xDEADBEEFu;
        uint uhex3 = 0XABCDu;
        uint uhex4 = 0xdeadbeefu;
        // Float — decimal point variants
        float f1 = 1.5;
        float f2 = 1.;
        float f3 = .5;
        // Float — exponent variants
        float fe1 = 1e10;
        float fe2 = 1.5E-3;
        float fe3 = .5e+2;
        float fe4 = 2e+3;
        // Float + `f`/`F` suffix on decimal forms
        float ff1 = 1.5f;
        float ff2 = .5F;
        float ff3 = 1.f;
        float ff4 = 1e10f;
        // Pure-integer + `f`/`F` suffix
        float fi1 = 5f;
        float fi2 = 100F;

        gl_Position =
          renderer_MVPMat *
          vec4(
            attr.POSITION +
              vec3(
                float(dec1 + dec2 + hex1) +
                  float(udec1 + udec2 + uhex1 + uhex2 + uhex3 + uhex4) +
                  f1 + f2 + f3 + fe1 + fe2 + fe3 + fe4 +
                  ff1 + ff2 + ff3 + ff4 + fi1 + fi2
              ),
            1.0
          );
      }

      // Mirrors the Hammersley `radicalInverse_VdC` bit twiddle from
      // `galacean-tools/baker/src/shader/IBLBaker.shader`. Inlined into
      // `frag` so all tokens reach the fragment instruction stream.
      void frag() {
        uint bits = 7u;
        bits = (bits << 16u) | (bits >> 16u);
        bits = ((bits & 0x55555555u) << 1u) | ((bits & 0xAAAAAAAAu) >> 1u);
        bits = ((bits & 0x33333333u) << 2u) | ((bits & 0xCCCCCCCCu) >> 2u);
        gl_FragColor = vec4(float(bits) * 2.3283064365386963e-10, 0.0, 0.0, 1.0);
      }

      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}
