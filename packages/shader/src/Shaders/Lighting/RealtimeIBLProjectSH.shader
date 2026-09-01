Shader "Lighting/RealtimeIBLProjectSH" {
  SubShader "Default" {
    Pass "TransformFeedback" {
      Tags { pipelineStage = "TransformFeedback" }

      VertexShader = vert;
      FragmentShader = frag;

      samplerCube renderer_SHSourceMap;
      float renderer_SHSourceMipLevel;

      const float PI = 3.14159265359;
      const float FOUR_PI = 12.5663706144;
      const int SAMPLE_AXIS_COUNT = 8;
      const float SAMPLE_COUNT = 64.0;

      struct Attributes {
        float a_Dummy;
      };

      struct Varyings {
        vec4 v_SH0;
        vec4 v_SH1;
        vec4 v_SH2;
        vec4 v_SH3;
        vec4 v_SH4;
        vec4 v_SH5;
        vec4 v_SH6;
        vec4 v_SH7;
        vec4 v_SH8;
      };

      vec3 uniformSampleSphere(int sampleX, int sampleY) {
        vec2 samplePoint = (vec2(float(sampleX), float(sampleY)) + 0.5) / float(SAMPLE_AXIS_COUNT);
        float z = 1.0 - 2.0 * samplePoint.y;
        float radius = sqrt(max(0.0, 1.0 - z * z));
        float phi = 2.0 * PI * samplePoint.x;
        return vec3(radius * cos(phi), radius * sin(phi), z);
      }

      void evaluateBasis(vec3 direction, out float basis[9]) {
        float x = direction.x;
        float y = direction.y;
        float z = direction.z;
        basis[0] = 0.282095;
        basis[1] = -0.488603 * y;
        basis[2] = 0.488603 * z;
        basis[3] = -0.488603 * x;
        basis[4] = 1.092548 * x * y;
        basis[5] = -1.092548 * y * z;
        basis[6] = 0.315392 * (3.0 * z * z - 1.0);
        basis[7] = -1.092548 * x * z;
        basis[8] = 0.546274 * (x * x - y * y);
      }

      float preScale(int coefficient) {
        if (coefficient == 0) {
          return 0.886227;
        }
        if (coefficient == 1) {
          return -1.023327;
        }
        if (coefficient == 2) {
          return 1.023327;
        }
        if (coefficient == 3) {
          return -1.023327;
        }
        if (coefficient == 4) {
          return 0.858086;
        }
        if (coefficient == 5) {
          return -0.858086;
        }
        if (coefficient == 6) {
          return 0.247708;
        }
        if (coefficient == 7) {
          return -0.858086;
        }
        return 0.429042;
      }

      vec4 packCoefficient(vec3 coefficient, int index) {
        return vec4(coefficient * preScale(index), 0.0);
      }

      Varyings vert(Attributes attr) {
        Varyings varyings;
        vec3 coefficients[9];
        for (int coefficient = 0; coefficient < 9; coefficient++) {
          coefficients[coefficient] = vec3(0.0);
        }

        for (int sampleY = 0; sampleY < SAMPLE_AXIS_COUNT; sampleY++) {
          for (int sampleX = 0; sampleX < SAMPLE_AXIS_COUNT; sampleX++) {
            vec3 direction = uniformSampleSphere(sampleX, sampleY);
            vec3 radiance = textureCubeLodEXT(renderer_SHSourceMap, direction, renderer_SHSourceMipLevel).rgb;
            float basis[9];
            evaluateBasis(direction, basis);
            for (int coefficient = 0; coefficient < 9; coefficient++) {
              coefficients[coefficient] += radiance * basis[coefficient];
            }
          }
        }

        float normalization = FOUR_PI / SAMPLE_COUNT;
        for (int coefficient = 0; coefficient < 9; coefficient++) {
          coefficients[coefficient] *= normalization;
        }
        varyings.v_SH0 = packCoefficient(coefficients[0], 0);
        varyings.v_SH1 = packCoefficient(coefficients[1], 1);
        varyings.v_SH2 = packCoefficient(coefficients[2], 2);
        varyings.v_SH3 = packCoefficient(coefficients[3], 3);
        varyings.v_SH4 = packCoefficient(coefficients[4], 4);
        varyings.v_SH5 = packCoefficient(coefficients[5], 5);
        varyings.v_SH6 = packCoefficient(coefficients[6], 6);
        varyings.v_SH7 = packCoefficient(coefficients[7], 7);
        varyings.v_SH8 = packCoefficient(coefficients[8], 8);
        gl_Position = vec4(0.0);
        return varyings;
      }

      void frag(Varyings varyings) {
        discard;
      }
    }
  }
}
