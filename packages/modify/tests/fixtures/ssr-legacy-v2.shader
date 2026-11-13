// Legacy Surface stores oct8 view-space normals. Keep this V2 fixture for asset compatibility tests.
Shader "SSRTest/LegacyViewNormalV2" {
  SubShader "Default" {
    Tags { screenSpaceReflectionAuto = "PbrV1" }
    Pass "Forward" {
      Tags { pipelineStage = "Forward" }
      DepthState = { Enabled = true; WriteEnabled = true; }
      RenderQueueType = Opaque;
      VertexShader = vert;
      FragmentShader = frag;
      mat4 renderer_MVPMat;
      struct Attributes { vec4 POSITION; };
      struct Varyings { vec4 positionCS; };
      Varyings vert(Attributes input) {
        Varyings output;
        output.positionCS = renderer_MVPMat * input.POSITION;
        gl_Position = output.positionCS;
        return output;
      }
      vec4 frag(Varyings input) { return vec4(0.2, 0.4, 0.6, 1.0); }
    }
    Pass "ScreenSpaceReflectionSurface" {
      Tags {
        pipelineStage = "ScreenSpaceReflectionSurface",
        screenSpaceReflectionReceiver = "ColorResponseV2"
      }
      DepthState = { Enabled = true; WriteEnabled = true; }
      RenderQueueType = Opaque;
      VertexShader = vert;
      FragmentShader = frag;
      mat4 renderer_MVPMat;
      mat4 renderer_NormalMat;
      mat4 camera_ViewMat;
      float material_ScreenSpaceReflectionMode;
      struct Attributes { vec4 POSITION; vec3 NORMAL; };
      struct Varyings { vec3 normalWS; };
      struct SurfaceOutput {
        layout(location = 0) vec4 geometry;
        layout(location = 1) vec4 responseColor;
      };
      Varyings vert(Attributes input) {
        Varyings output;
        output.normalWS = mat3(renderer_NormalMat) * input.NORMAL;
        gl_Position = renderer_MVPMat * input.POSITION;
        return output;
      }
      vec2 encodeLegacyViewNormal(vec3 normal) {
        normal /= max(abs(normal.x) + abs(normal.y) + abs(normal.z), 0.000001);
        vec2 encoded = normal.xy;
        if (normal.z < 0.0) {
          encoded = (1.0 - abs(encoded.yx)) * vec2(encoded.x >= 0.0 ? 1.0 : -1.0, encoded.y >= 0.0 ? 1.0 : -1.0);
        }
        return encoded * 0.5 + 0.5;
      }
      SurfaceOutput frag(Varyings input) {
        if (material_ScreenSpaceReflectionMode < 0.5) discard;
        vec3 viewNormal = normalize(mat3(camera_ViewMat) * input.normalWS);
        SurfaceOutput output;
        output.geometry = vec4(encodeLegacyViewNormal(viewNormal), 0.1, 1.0);
        output.responseColor = vec4(1.0);
        return output;
      }
    }
  }
}
