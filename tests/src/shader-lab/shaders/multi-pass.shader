Shader "Triangle" {
  SubShader "Default" {
     mat4 renderer_MVPMat;

     struct a2v {
       vec4 POSITION;
       vec2 TEXCOORD_0; 
      };

      struct v2f {
       vec2 v_uv;
       vec3 v_position;
       mat3 v_TBN;
      };

      mat4 renderer_MVPMat;
      mat4 renderer_MVMat;

      sampler2D material_BaseTexture;
      vec4 u_color;
      vec4 u_fogColor;
      float u_fogDensity;

      vec4 linearToGamma(vec4 linearIn) {
          return vec4(pow(linearIn.rgb, vec3(1.0 / 2.2)), linearIn.a);
    }

     v2f vert_internal(a2v v, vec2 fur_offset) {
      v2f o;

        o.v_uv = v.TEXCOORD_0 + fur_offset;
        vec4 tmp = renderer_MVMat * v.POSITION;
        o.v_position = tmp.xyz;
        gl_Position = renderer_MVPMat * v.POSITION;
        
        return o;
    }

    void frag_internal(v2f i) {
        vec4 color = texture2D(material_BaseTexture, i.v_uv) * u_color;
        float fogDistance = length(i.v_position);
        float fogAmount = 1.0 - exp2(-u_fogDensity * u_fogDensity * fogDistance * fogDistance * 1.442695);
        fogAmount = clamp(fogAmount, 0.0, 1.0);
        gl_FragColor = mix(color, u_fogColor, fogAmount); 

        // For testing only (macro)
          gl_FragColor = linearToGamma(gl_FragColor);

          gl_FragColor = vec4(1.0, 1.0, 0.0, 0.0);
    }
     
    Pass "0" {
      vec3 u_color;

      struct a2v {
        vec4 POSITION;
      };

      struct v2f {
        vec3 v_color;
      };

      v2f vert(a2v v) {
        v2f o;

        gl_Position = renderer_MVPMat * v.POSITION;
        o.v_color = u_color;
        return o;
      }

      void frag(v2f i) {
        gl_FragColor = vec4(i.v_color, 1.0);
      }

      VertexShader = vert;
      FragmentShader = frag;
    }

    Pass "1" {
      vec3 u_color;

      struct a2v {
        vec4 POSITION;
      };

      struct v2f {
        vec3 v_color;
      };

      v2f vert(a2v v) {
        v2f o;

        gl_Position = renderer_MVPMat * v.POSITION;
        o.v_color = u_color;
        return o;
      }

      void frag(v2f i) {
        gl_FragColor = vec4(i.v_color, 1.0);
      }

      VertexShader = vert;
      FragmentShader = frag;
    }

    Pass "2" {
     v2f vert(a2v v) {
        return vert_internal(v, vec2(0.1));
      }

      void frag(v2f i) {
        frag_internal(i);
      }

      VertexShader = vert;
      FragmentShader = frag;
    }

    Pass "3" {

      Tags { ReplacementTag = "Opaque" }

      v2f vert(a2v v) {
        return vert_internal(v, vec2(0.2));
      }

      void frag(v2f i) {
        frag_internal(i);
      }

      VertexShader = vert;
      FragmentShader = frag;
    }
    UsePass "blinn-phong/Default/Forward"
  }
}