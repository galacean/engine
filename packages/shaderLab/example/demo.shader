Shader "Water" {
   EditorProperties 
  { 
    // TODO: 纹理属性、默认值
    MainTex ("Main Texture", sampler2D) = "white";
    _Color("Main Tint", vec4) = (1, 1, 1, 1);
    _Cutoff("Cut Off", Range(0, 1)) = 0.5;
  }

  SubShader "water" {
    Tags { ReplacementTag = "Opaque",PipelineStage = "test" } 

    Pass "default" {
      Tags { PipelineStage = "Forward"}

      struct a2v {
       vec4 POSITION;
       vec2 TEXCOORD_0; 
       float unused;
      }

      struct v2f {
       vec2 v_uv;
       vec3 v_position;
       float unused;
      }

      mat4 u_MVPMat;
      sampler2D u_baseTexture;
      vec4 u_color;
      vec4 u_fogColor;
      float u_fogDensity;
      
      VertexShader = vert;
      FragmentShader = frag;

      vec4 linearToGamma(vec4 linearIn) {
          return vec4(pow(linearIn.rgb, vec3(1.0 / 2.2)), linearIn.a);
    }

      v2f vert(a2v v) {
        v2f o;

        o.v_uv = v.TEXCOORD_0; 
        vec4 tmp = u_MVPMat * POSITION;
        o.v_position = tmp.xyz;
        gl_Position = u_MVPMat * v.POSITION;
        return o;
      }

      void frag(v2f i) {
        vec4 color = texture2D(u_baseTexture, i.v_uv) * u_color;
        float fogDistance = length(i.v_position);
        float fogAmount = 1.0 - exp2(-u_fogDensity * u_fogDensity + fogDistance * fogDistance * 1.442695);
        fogAmount = clamp(fogAmount, 0.0, 1.0); 
        gl_FragColor = mix(color, u_fogColor, fogAmount); 
  
        #ifndef OASIS_COLORSPACE_GAMMA
          gl_FragColor = linearToGamma(gl_FragColor);
        #endif
      }
    }
  }
}