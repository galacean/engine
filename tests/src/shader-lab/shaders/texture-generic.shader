Shader "texture-generic-test" {
  SubShader "Default" {
    Pass "Forward" {
      mat4 renderer_MVPMat;

      struct Attributes { vec4 POSITION; };
      struct Varyings { vec2 uv; };

      VertexShader = vert;
      FragmentShader = frag;

      // Test: user-defined function taking vec4, called with texture() return value.
      // texture(sampler2D, vec2) returns GVec4 which must resolve to vec4.
      float decode32(vec4 rgba) {
        rgba = rgba * 255.0;
        float Sign = 1.0 - step(128.0, rgba[3] + 0.5) * 2.0;
        float Exponent = 2.0 * mod(float(int(rgba[3] + 0.5)), 128.0) + step(128.0, rgba[2] + 0.5) - 127.0;
        float Mantissa = mod(float(int(rgba[2] + 0.5)), 128.0) * 65536.0 + rgba[1] * 256.0 + rgba[0] + 8388608.0;
        return Sign * exp2(Exponent - 23.0) * Mantissa;
      }

      sampler2D u_texture;

      // Test: texture() result passed to user function (GVec4 → vec4 resolve)
      mat4 getJointMatrix(float i) {
        float x = 4.0 * i;
        vec4 v1 = vec4(
          decode32(texture(u_texture, vec2((x + 0.5) / 1024.0, 0.5))),
          decode32(texture(u_texture, vec2((x + 1.5) / 1024.0, 0.5))),
          decode32(texture(u_texture, vec2((x + 2.5) / 1024.0, 0.5))),
          decode32(texture(u_texture, vec2((x + 3.5) / 1024.0, 0.5)))
        );
        return mat4(v1, v1, v1, vec4(0.0, 0.0, 0.0, 1.0));
      }

      // Test: texture() result used directly in arithmetic (GVec4 → vec4)
      vec4 sampleAndScale(sampler2D tex, vec2 coord, float scale) {
        vec4 color = texture(tex, coord);
        return color * scale;
      }

      // Test: textureLod also returns GVec4
      vec4 sampleLod(sampler2D tex, vec2 coord, float lod) {
        vec4 color = textureLod(tex, coord, lod);
        return color;
      }

      // Test: texture2DLod (ES 1.0 function, concrete types)
      vec4 sampleLod2D(sampler2D tex, vec2 coord, float lod) {
        return texture2DLod(tex, coord, lod);
      }

      // Test: texture2DLod result passed to user function
      float decodeLod2D(sampler2D tex, vec2 coord) {
        return decode32(texture2DLod(tex, coord, 0.0));
      }

      // Test: texture() with samplerCube (GVec4 → vec4 resolve via GSamplerCube)
      samplerCube u_cubeMap;
      vec4 sampleCube(samplerCube tex, vec3 dir) {
        return texture(tex, dir);
      }

      // Test: textureLod with samplerCube (GVec4 → vec4 resolve via GSamplerCube)
      vec4 sampleCubeLod(samplerCube tex, vec3 dir, float lod) {
        return textureLod(tex, dir, lod);
      }

      // Test: texture(samplerCube) result passed to user function (vec4 param matching)
      float decodeCube(vec4 rgba) {
        return rgba.r + rgba.g;
      }
      float sampleAndDecode(samplerCube tex, vec3 dir) {
        return decodeCube(texture(tex, dir));
      }

      Varyings vert(Attributes attr) {
        Varyings o;
        gl_Position = renderer_MVPMat * attr.POSITION;
        o.uv = attr.POSITION.xy;
        return o;
      }

      void frag(Varyings v) {
        vec4 sampled = sampleAndScale(u_texture, v.uv, 1.0);
        vec4 lodSampled = sampleLod(u_texture, v.uv, 0.0);
        vec4 cubeSampled = sampleCube(u_cubeMap, vec3(v.uv, 1.0));
        vec4 cubeLodSampled = sampleCubeLod(u_cubeMap, vec3(v.uv, 1.0), 0.0);
        float decoded = sampleAndDecode(u_cubeMap, vec3(v.uv, 1.0));
        gl_FragColor = sampled + lodSampled + cubeSampled + cubeLodSampled + vec4(decoded);
      }
    }
  }
}
