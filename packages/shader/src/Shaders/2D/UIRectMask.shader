Shader "2D/UIRectMask" {
  SubShader "Default" {
    Pass "Default" {
      Tags { pipelineStage = "Forward" }
      VertexShader = vert;
      FragmentShader = frag;
      struct Attributes { vec3 POSITION; };
      struct Varyings { vec2 worldPosition; };
      mat4 renderer_MVPMat;
      vec4 renderElement_MaskRect;
      Varyings vert(Attributes attr) {
        Varyings v;
        gl_Position = renderer_MVPMat * vec4(attr.POSITION, 1.0);
        v.worldPosition = attr.POSITION.xy;
        return v;
      }
      void frag(Varyings v) {
        vec4 distance = vec4(v.worldPosition - renderElement_MaskRect.xy, renderElement_MaskRect.zw - v.worldPosition);
        if (min(min(distance.x, distance.y), min(distance.z, distance.w)) < 0.0) discard;
        gl_FragColor = vec4(0.0);
      }
    }
    Pass "Initialize" {
      Tags { pipelineStage = "UIStencilInitialize" }
      VertexShader = vert;
      FragmentShader = frag;
      struct Attributes { vec4 POSITION_UV; };
      void vert(Attributes attr) {
        gl_Position = vec4(attr.POSITION_UV.xy, 0.0, 1.0);
      }
      void frag() {
        gl_FragColor = vec4(0.0);
      }
    }
  }
}
