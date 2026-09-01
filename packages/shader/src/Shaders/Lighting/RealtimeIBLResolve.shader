Shader "Lighting/RealtimeIBLResolve" {
  SubShader "Default" {
    Pass "Forward" {
      Tags { pipelineStage = "Forward" }

      DepthState = {
        Enabled = false;
        WriteEnabled = false;
      }

      VertexShader = vert;
      FragmentShader = frag;

      samplerCube material_SourceMap;
      float material_Face;
      float material_SourceLod;
      float material_ResolveAccumulation;
      float material_Downsample;
      float material_TargetSize;

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

      vec3 cubeDirectionFromScaled(vec2 scaledUV, float face) {
        float cx = scaledUV.x;
        float cy = scaledUV.y;
        vec3 direction;
        if (face == 0.0) direction = vec3(1.0, cy, -cx);
        else if (face == 1.0) direction = vec3(-1.0, cy, cx);
        else if (face == 2.0) direction = vec3(cx, 1.0, -cy);
        else if (face == 3.0) direction = vec3(cx, -1.0, cy);
        else if (face == 4.0) direction = vec3(cx, cy, 1.0);
        else direction = vec3(-cx, cy, -1.0);
        return normalize(direction);
      }

      vec3 cubeDirection(vec2 uv, float face) {
        return cubeDirectionFromScaled(uv * 2.0 - 1.0, face);
      }

      vec4 downsampleCube(vec2 uv, float face) {
        vec2 scaledUV = uv * 2.0 - 1.0;
        vec3 normal = cubeDirectionFromScaled(scaledUV, face);
        vec3 tangentX = normalize(cross(cubeDirectionFromScaled(scaledUV + vec2(0.0, 1.0), face), normal));
        vec3 tangentY = cross(normal, tangentX);
        float sampleOffset = 4.0 / material_TargetSize;
        vec2 offsets[8];
        offsets[0] = vec2(-0.7, -0.7);
        offsets[1] = vec2(0.7, -0.7);
        offsets[2] = vec2(-0.7, 0.7);
        offsets[3] = vec2(0.7, 0.7);
        offsets[4] = vec2(0.0, -1.0);
        offsets[5] = vec2(-1.0, 0.0);
        offsets[6] = vec2(1.0, 0.0);
        offsets[7] = vec2(0.0, 1.0);

        vec4 color = textureCubeLodEXT(material_SourceMap, normal, material_SourceLod);
        for (int index = 0; index < 8; index++) {
          vec3 sampleDirection = normalize(
            normal + tangentX * offsets[index].x * sampleOffset + tangentY * offsets[index].y * sampleOffset
          );
          color += textureCubeLodEXT(material_SourceMap, sampleDirection, material_SourceLod) * 0.375;
        }
        return color * 0.25;
      }

      void frag(Varyings v) {
        if (material_Downsample > 0.5) {
          gl_FragColor = downsampleCube(v.v_uv, material_Face);
        } else {
          vec3 direction = cubeDirection(v.v_uv, material_Face);
          vec4 source = textureCubeLodEXT(material_SourceMap, direction, material_SourceLod);
          if (material_ResolveAccumulation > 0.5) {
            source = vec4(source.rgb / max(source.a, 0.000001), 1.0);
          } else {
            source.a = 1.0;
          }
          gl_FragColor = source;
        }
      }
    }
  }
}
