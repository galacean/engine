Shader "Lighting/RealtimeIBLAccumulate" {
  SubShader "Default" {
    Pass "Forward" {
      Tags { pipelineStage = "Forward" }

      DepthState = {
        Enabled = false;
        WriteEnabled = false;
      }

      VertexShader = vert;
      FragmentShader = frag;

      #include "ShaderLibrary/Common/Common.glsl"

      samplerCube material_EnvironmentMap;
      samplerCube material_PreviousAccumulationMap;
      float material_Face;
      float material_Roughness;
      float material_EnvironmentSize;
      float material_AccumulationLod;
      float material_SampleOffset;
      float material_TotalSampleCount;

      const uint SAMPLE_BATCH_SIZE = 32u;
      const float MIN_ALPHA = 0.002025;
      const float HDR_LINEAR = 1024.0;
      const float HDR_MAX = 16384.0;

      struct Attributes {
        vec3 POSITION;
        vec2 TEXCOORD_0;
      };

      struct Varyings {
        vec2 v_uv;
      };

      Varyings vert(Attributes attr) {
        Varyings v;
        gl_Position = vec4(attr.POSITION.xzy, 1.0);
        gl_Position.y *= -1.0;
        v.v_uv = attr.TEXCOORD_0;
        return v;
      }

      vec3 cubeDirection(vec2 uv, float face) {
        float cx = uv.x * 2.0 - 1.0;
        float cy = uv.y * 2.0 - 1.0;
        vec3 direction;
        if (face == 0.0) direction = vec3(1.0, cy, -cx);
        else if (face == 1.0) direction = vec3(-1.0, cy, cx);
        else if (face == 2.0) direction = vec3(cx, 1.0, -cy);
        else if (face == 3.0) direction = vec3(cx, -1.0, cy);
        else if (face == 4.0) direction = vec3(cx, cy, 1.0);
        else direction = vec3(-cx, cy, -1.0);
        return normalize(direction);
      }

      vec3 compressHDR(vec3 color) {
        const vec3 rec709 = vec3(0.2126, 0.7152, 0.0722);
        float luma = dot(color, rec709);
        float scale = 1.0;
        if (luma > HDR_LINEAR) {
          scale = (HDR_LINEAR * HDR_LINEAR - HDR_MAX * luma) /
            ((2.0 * HDR_LINEAR - HDR_MAX - luma) * luma);
        }
        return color * scale;
      }

      float D_GGX(float alpha, float NoH) {
        float f = (alpha - 1.0) * ((alpha + 1.0) * (NoH * NoH)) + 1.0;
        return (alpha * alpha) / (PI * f * f);
      }

      float radicalInverseVdC(uint bits) {
        bits = (bits << 16u) | (bits >> 16u);
        bits = ((bits & 0x55555555u) << 1u) | ((bits & 0xAAAAAAAAu) >> 1u);
        bits = ((bits & 0x33333333u) << 2u) | ((bits & 0xCCCCCCCCu) >> 2u);
        bits = ((bits & 0x0F0F0F0Fu) << 4u) | ((bits & 0xF0F0F0F0u) >> 4u);
        bits = ((bits & 0x00FF00FFu) << 8u) | ((bits & 0xFF00FF00u) >> 8u);
        return float(bits) * 2.3283064365386963e-10;
      }

      vec2 hammersley(uint index, uint count) {
        return vec2(float(index) / float(count), radicalInverseVdC(index));
      }

      vec3 importanceSampleGGX(vec2 xi, vec3 normal, float roughness) {
        float alpha = roughness * roughness;
        float phi = 2.0 * PI * xi.x;
        float cosTheta2 = (1.0 - xi.y) / (1.0 + (alpha + 1.0) * ((alpha - 1.0) * xi.y));
        float cosTheta = sqrt(cosTheta2);
        float sinTheta = sqrt(1.0 - cosTheta2);
        vec3 halfVector = vec3(cos(phi) * sinTheta, sin(phi) * sinTheta, cosTheta);

        vec3 up = abs(normal.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
        vec3 tangent = normalize(cross(up, normal));
        vec3 bitangent = cross(normal, tangent);
        return normalize(tangent * halfVector.x + bitangent * halfVector.y + normal * halfVector.z);
      }

      vec3 cosineSampleHemisphere(vec2 xi, vec3 normal) {
        float phi = 2.0 * PI * xi.x;
        float radius = sqrt(xi.y);
        vec3 localDirection = vec3(cos(phi) * radius, sin(phi) * radius, sqrt(1.0 - xi.y));
        vec3 up = abs(normal.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
        vec3 tangent = normalize(cross(up, normal));
        vec3 bitangent = cross(normal, tangent);
        return normalize(tangent * localDirection.x + bitangent * localDirection.y + normal * localDirection.z);
      }

      void frag(Varyings v) {
        vec3 normal = cubeDirection(v.v_uv, material_Face);
        vec4 accumulation = material_SampleOffset == 0.0
          ? vec4(0.0)
          : textureCubeLodEXT(material_PreviousAccumulationMap, normal, material_AccumulationLod);
        float omegaP = 4.0 * PI / (6.0 * material_EnvironmentSize * material_EnvironmentSize);
        uint totalSampleCount = uint(material_TotalSampleCount);
        uint sampleOffset = uint(material_SampleOffset);

        for (uint localIndex = 0u; localIndex < SAMPLE_BATCH_SIZE; ++localIndex) {
          uint sampleIndex = sampleOffset + localIndex;
          vec2 xi = hammersley(sampleIndex, totalSampleCount);
          xi.y *= 0.995;
          if (material_Roughness > 0.99) {
            vec3 light = cosineSampleHemisphere(xi, normal);
            float NoL = max(dot(normal, light), 0.000001);
            float omegaS = PI / (material_TotalSampleCount * NoL);
            float sourceLod = max(0.5 * log2(omegaS / (2.0 * omegaP)), 0.0);
            accumulation.rgb += compressHDR(textureCubeLodEXT(material_EnvironmentMap, light, sourceLod).rgb) /
              material_TotalSampleCount;
            accumulation.a += 1.0 / material_TotalSampleCount;
            continue;
          }
          vec3 halfVector = importanceSampleGGX(xi, normal, material_Roughness);
          vec3 light = normalize(2.0 * dot(normal, halfVector) * halfVector - normal);
          float NoL = max(dot(normal, light), 0.0);
          if (NoL > 0.0) {
            float NoH = max(dot(normal, halfVector), 0.0);
            float alpha = max(MIN_ALPHA, material_Roughness * material_Roughness);
            float pdf = D_GGX(alpha, NoH) * 0.25;
            float omegaS = 1.0 / (material_TotalSampleCount * pdf);
            float sourceLod = max(0.5 * log2(omegaS / (2.0 * omegaP)), 0.0);
            vec3 radiance = compressHDR(textureCubeLodEXT(material_EnvironmentMap, light, sourceLod).rgb);
            accumulation.rgb += radiance * NoL / material_TotalSampleCount;
            accumulation.a += NoL / material_TotalSampleCount;
          }
        }

        gl_FragColor = accumulation;
      }
    }
  }
}
