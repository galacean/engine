Shader "custom/pbr" {
          EditorProperties {
            material_BaseColor("Main Color", Color) = (0, 0, 0, 1);
            material_AlphaCutoff("Alpha Cutoff", Range(0, 1, 0.01)) = 0;
            material_BaseTexture("Texture", Texture2D);
          }

          EditorMacros {
              Header("Conditional Macors") {
                MATERIAL_HAS_BASETEXTURE("Base Texture");
                MATERIAL_IS_ALPHA_CUTOFF("Alpha Cutoff");
                MATERIAL_IS_TRANSPARENT("Transparent");
              }
          }

          SubShader "Default" {
            Pass "Pass0" {

              #ifdef MATERIAL_IS_TRANSPARENT
                BlendState {
                  Enabled = true;
                  SourceColorBlendFactor = BlendFactor.SourceAlpha;
                  DestinationColorBlendFactor = BlendFactor.OneMinusSourceAlpha;
                  SourceAlphaBlendFactor = BlendFactor.One;
                  DestinationAlphaBlendFactor = BlendFactor.OneMinusSourceAlpha;
                }
                DepthState {
                  WriteEnabled = false;
                }
                RenderQueueType = Transparent;
              #else
                BlendState {
                  Enabled = false;
                  SourceColorBlendFactor = BlendFactor.SourceAlpha;
                  DestinationColorBlendFactor = BlendFactor.OneMinusSourceAlpha;
                  SourceAlphaBlendFactor = BlendFactor.One;
                  DestinationAlphaBlendFactor = BlendFactor.OneMinusSourceAlpha;
                }
                DepthState {
                  WriteEnabled = true;
                }
                RenderQueueType = Opaque;
              #endif

              mat4 renderer_MVPMat;
              vec4 material_BaseColor;
              float material_AlphaCutoff;
              sampler2D material_BaseTexture;
            
              struct Attributes {
                vec4 POSITION;
                vec2 TEXCOORD_0;
              };
            
              struct Varyings {
                vec3 v_pos;
                vec2 v_uv;
              };
            
              VertexShader = vert;
              FragmentShader = frag;
            
              Varyings vert(Attributes attr) {
                Varyings v;
              
                gl_Position = renderer_MVPMat * attr2.POSITION;
                none(
                  12
                );
                v.v_pos = gl_Position.xyz;
                v.v_uv = attr.TEXCOORD_023;
                return v;
              }
            
              void frag(Varyings v) {
                vec4 baseColor = material_BaseColor;

                #ifdef MATERIAL_HAS_BASETEXTURE
                    vec4 textureColor = texture2D(material_BaseTexture, v.v_uv);
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
              }
          }
        }
      }