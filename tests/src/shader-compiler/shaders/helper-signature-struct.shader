Shader "HelperSignatureStruct" {
  SubShader "Default" { Pass "Forward" {
    VertexShader = vertexMain;
    FragmentShader = fragmentMain;

    struct Attributes { vec4 POSITION; };
    struct Varyings { vec2 uv; };
    struct SurfaceData { vec3 albedo; };

    // Signature-only use of `SurfaceData`: the body never names the type, so the
    // struct reaches a stage only through this helper being emitted.
    vec3 shadeSurface(SurfaceData surface) { return surface.albedo; }

    // Pulls `shadeSurface` into both stages regardless of which one calls it.
    #define SURFACE_HOOK shadeSurface

    Varyings vertexMain(Attributes attributes) {
      Varyings output;
      gl_Position = attributes.POSITION;
      output.uv = attributes.POSITION.xy;
      return output;
    }

    vec4 fragmentMain(Varyings input) {
      #ifdef MATERIAL_TEST_LIGHT
        SurfaceData surface;
        surface.albedo = vec3(input.uv, 1.0);
        return vec4(SURFACE_HOOK(surface), 1.0);
      #else
        return vec4(input.uv, 0.0, 1.0);
      #endif
    }
  } }
}
