ComputeShader "Lighting/RealtimeIBLProjectSHCompute" {
  Kernel "Project" {
    WorkgroupSize = (1, 1, 1);
    ComputeKernel = csProject;

    #include "ShaderLibrary/Lighting/RealtimeIBLProjectSHCore.glsl"

    storage OutSH {
      vec4 outCoefficients[9];
    };

    void csProject() {
      vec4 packed[9];
      projectSHCoefficients(packed);
      for (int i = 0; i < 9; i++) {
        outCoefficients[i] = packed[i];
      }
    }
  }

  Kernel "Blend" {
    WorkgroupSize = (9, 1, 1);
    ComputeKernel = csBlend;

    float renderer_SHBlend;

    readonly storage SourceSH {
      vec4 srcCoefficients[9];
    };

    readonly storage TargetSH {
      vec4 dstCoefficients[9];
    };

    storage OutSH {
      vec4 outCoefficients[9];
    };

    void csBlend() {
      uint idx = gl_GlobalInvocationID.x;
      if (idx < 9u) {
        outCoefficients[idx] = mix(srcCoefficients[idx], dstCoefficients[idx], renderer_SHBlend);
      }
    }
  }
}
