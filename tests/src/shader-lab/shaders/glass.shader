Shader "Gem" {
  SubShader "Default" {
    Pass "0" {
      struct a2v {
        vec4 POSITION;
        vec2 TEXCOORD_0;
        vec3 NORMAL;
        vec4 TANGENT;
      };

      struct v2f {
        vec2 v_uv;
        vec3 v_posWS;
        vec3 v_normalWS;
      };

      mat4 camera_VPMat;
      mat4 renderer_ModelMat;
      mat4 renderer_NormalMat;

      v2f vert( a2v attr ) {
        v2f vary;

        vec3 posWS = ( renderer_ModelMat * attr.POSITION ).xyz;
        vec3 NormalWS = normalize( mat3( renderer_NormalMat ) * attr.NORMAL.xyz );

        vec4 posCS = camera_VPMat * vec4( posWS, 1.0 );

        vary.v_uv = attr.TEXCOORD_0;
        vary.v_posWS = posWS;
        vary.v_normalWS = NormalWS;

        gl_Position = posCS;
        return vary;
      }

      vec3 camera_Position;
      mat4 camera_ViewMat;
      vec4 _RefractColor;
      vec4 _Thinkmap_ST;
      vec4 _DirtyMask_ST;
      vec4 _Decal_ST;
      float _Min;
      float _Max;
      float _DirtyIntensity;
      float _RefractIntensity;
      float _ReflectFresnelBias;
      float _ReflectFresnelScale;
      float _ReflectFresnelPower;
      float _ReflectIntensity;

      sampler2D _ReflectMatcap;
      sampler2D _RefractMatcap;
      sampler2D _Thinkmap;
      sampler2D _DirtyMask;
      sampler2D _Decal;

      vec2 getMatcapUV( mat4 viewMatrix, vec3 worldNormal ) {
        return( ( ( mat3( viewMatrix ) * worldNormal ).xy ) * 0.5 ) + 0.5;
      }

      void frag( v2f vary ) {
        vec3 posWS = vary.v_posWS;
        vec3 normalWS = vary.v_normalWS;

        vec3 viewDirWS = normalize( camera_Position - posWS );

        vec2 MarCapUV = getMatcapUV( camera_ViewMat, normalWS );
        // 反射
        vec4 reflectCol = texture2D( _ReflectMatcap, MarCapUV );

        // 厚度
        float dotResult = dot( normalWS, viewDirWS );
        float smoothstepResult = smoothstep( _Min, _Max, dotResult );

        vec2 uv_Thinkmap = vary.v_uv * _Thinkmap_ST.xy + _Thinkmap_ST.zw;
        vec4 thinkMapPixel = texture2D( _Thinkmap, uv_Thinkmap );
        float tmp_thinkness = thinkMapPixel.r;

        // 污渍
        vec2 uv_DirtyMask = vary.v_uv * _DirtyMask_ST.xy + _DirtyMask_ST.zw;
        vec4 dirtyPixel = texture2D( _DirtyMask, uv_DirtyMask );
        float dirtyCol = _DirtyIntensity * dirtyPixel.r;

        float Thinkness = clamp( ( ( 1.0 - smoothstepResult ) + tmp_thinkness + dirtyCol ), 0.0, 1.0 );

        // 折射
        float temp_output4 = ( Thinkness * _RefractIntensity );
        vec4 refractCol = mix( _RefractColor * 0.5, _RefractColor * texture2D( _RefractMatcap, MarCapUV + temp_output4 ), temp_output4 );

        vec4 temp_output5 = ( reflectCol + refractCol );

        // 贴花
        vec2 uv_Decal = vary.v_uv * _Decal_ST.xy + _Decal_ST.zw;
        vec4 decalCol = texture2D( _Decal, uv_Decal );
        vec4 temp_output6 = mix( temp_output5, decalCol, decalCol.a );
        float decalAlpha = decalCol.a;

        // 计算菲涅尔
        float fresnelNdotV = dot( normalWS, viewDirWS );
        float fresnel = ( _ReflectFresnelBias + _ReflectFresnelScale * pow( 1.0 - fresnelNdotV, _ReflectFresnelPower ) );

        float alpha = clamp( ( decalAlpha + max( ( fresnel * reflectCol.r * _ReflectIntensity ), Thinkness ) ), 0.0, 1.0 );
        vec3 color = temp_output6.rgb;

        gl_FragColor = vec4( color, alpha );
      }

      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}