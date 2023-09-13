Shader "Water" {

  DepthState depthState {
    Enabled = true;
    WriteEnabled = false;
    CompareFunction = CompareFunction.Greater;
  }

  RasterState rasterState {
    CullMode = CullMode.Front;
    DepthBias = 0.1;
    SlopeScaledDepthBias = 0.8;
  }

  SubShader {
    Tags { LightMode = "ForwardBase", Tag2 = true, Tag3 = 1.2 }

    BlendFactor material_SrcBlend;

    BlendState blendState {
      SourceAlphaBlendFactor = material_SrcBlend;
      Enabled[0] = true;
      ColorWriteMask[0] = 0.8;
      BlendColor = vec4(1.0, 1.0, 1.0, 1.0);
      AlphaBlendOperation = BlendOperation.Max;
    }

    sampler2D u_textures[3];

    Pass "default" {
      Tags { ReplacementTag = "Opaque", Tag2 = true, Tag3 = 1.9 }

      struct a2v {
        vec4 POSITION;
        vec2 TEXCOORD_0; 
      }

      struct v2f {
        vec2 v_uv;
        vec3 v_position;
      }

      #define SCENE_SHADOW_TYPE 3
      #define RENDERER_BLENDSHAPE_COUNT 10

      lowp mat4 renderer_MVPMat;
      highp mat4 renderer_MVMat;

      mediump vec4 u_color;
      lowp vec4 u_fogColor;
      highp float u_fogDensity;
      vec4 material_BaseColor;
      float material_AlphaCutoff;
      vec4 material_BaseColor;
      float material_AlphaCutoff;
      ivec3 renderer_BlendShapeTextureInfo;
      vec2 renderer_BlendShapeWeights[RENDERER_BLENDSHAPE_COUNT];
      
      VertexShader = vert;
      FragmentShader = frag;

      #include <test_common>
      #include <brdf>

      BlendState = blendState;

      StencilState {
        Enabled = true;
        ReferenceValue = 2;
        Mask = 1.3; // 0xffffffff
        WriteMask = 0.32; // 0xffffffff
        CompareFunctionFront = CompareFunction.Less;
        PassOperationBack = StencilOperation.Zero;
      }

      DepthState = depthState;
      RasterState = rasterState;

      vec3 getBlendShapeVertexElement(int blendShapeIndex, int vertexElementIndex)
      {			
        int y = vertexElementIndex / renderer_BlendShapeTextureInfo.y;
        int x = vertexElementIndex - y * renderer_BlendShapeTextureInfo.y;
        ivec3 uv = ivec3(x, y , blendShapeIndex);
        vec4 tmp = texture2D(u_textures[1], vec2(uv.xy));
        return tmp.xyz;
      }

      v2f vert(a2v v) {
        v2f o;

        o.v_uv = v.TEXCOORD_0;
        vec4 tmp = renderer_MVMat * POSITION;
        o.v_position = tmp.xyz;
        gl_Position = renderer_MVPMat * v.POSITION;

        // test include
        mediump float test = G_GGX_SmithCorrelated(1.0, 1.0, 0.5);

        for(int i = 0; i < RENDERER_BLENDSHAPE_COUNT; i++){
          int vertexElementOffset = 2;
          float weight = renderer_BlendShapeWeights[i].x;
          o.v_position.xyz += getBlendShapeVertexElement(i, vertexElementOffset) * weight;
          
          #ifndef MATERIAL_OMIT_NORMAL
            #if defined( RENDERER_HAS_NORMAL ) && defined( RENDERER_BLENDSHAPE_HAS_NORMAL )
              vertexElementOffset += 1;
              normal += getBlendShapeVertexElement(i, vertexElementOffset) * weight;
            #endif

            #if defined( RENDERER_HAS_TANGENT ) && defined(RENDERER_BLENDSHAPE_HAS_TANGENT) && ( defined(MATERIAL_HAS_NORMALTEXTURE) || defined(MATERIAL_HAS_CLEAR_COAT_NORMAL_TEXTURE) )
              vertexElementOffset += 1;
              tangent.xyz += getBlendShapeVertexElement(i, vertexElementOffset) * weight;
            #endif
          #endif
        }

        return o;
      }

      void frag(v2f i) {
        vec4 baseColor = material_BaseColor;

        #ifdef MATERIAL_HAS_BASETEXTURE
            vec4 textureColor = texture2D(u_textures[2], v_uv);
            #ifndef ENGINE_IS_COLORSPACE_GAMMA
                textureColor = gammaToLinear(textureColor);
            #endif
            baseColor *= textureColor;
        #endif

        #ifdef MATERIAL_IS_ALPHA_CUTOFF
          if( baseColor.a < material_AlphaCutoff ) {
              discard;
          }
        #endif

        gl_FragColor = baseColor;

        #ifndef MATERIAL_IS_TRANSPARENT
            gl_FragColor.a = 1.0;
        #endif

        #ifndef ENGINE_IS_COLORSPACE_GAMMA
            gl_FragColor = linearToGamma(gl_FragColor);
        #endif
      }
    }
  }
}