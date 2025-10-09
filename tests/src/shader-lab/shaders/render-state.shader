Shader "render-state-test" {
    SubShader "Default" {
      Pass "Forward Pass" {
		Tags { LightMode = "ForwardBase", ReplacementTag = "Opaque", pipelineStage = "DepthOnly"}

        RenderQueueType renderQueueType;
        Bool depthWriteEnabled;
        Bool blendEnabled2;
        CullMode rasterStateCullMode2;

        DepthState customDepthState {
        	WriteEnabled = depthWriteEnabled;
        }

    	BlendState customBlendState {
    		Enabled[0] = true;
    	  	ColorWriteMask[0] = 0.8;
    	  	BlendColor = Color(1.0, 1.0, 1.0, 1.0);
    	  	AlphaBlendOperation = BlendOperation.Max;
    	}

		StencilState customStencilState {
      		Enabled = true;
      		Mask = 1.3; // 0xffffffff
      		WriteMask = 0.32; // 0xffffffff
      		CompareFunctionFront = CompareFunction.Less;
      		PassOperationBack = StencilOperation.Zero;
    	}

  		RasterState customRasterState {
  		  	CullMode = CullMode.Front;
  		  	DepthBias = 0.1;
  		  	SlopeScaledDepthBias = 0.8;
  		}

        DepthState = customDepthState;
        BlendState = customBlendState;
        RasterState = customRasterState;
		StencilState = customStencilState;
        RenderQueueType = renderQueueType;
      }

      Pass "Syntax Sugar Pass" {
        Bool depthWriteEnabled2;
        Bool blendEnabled2;
        CullMode rasterStateCullMode2;

        DepthState = {
          WriteEnabled = depthWriteEnabled2;
          Enabled = true;
          CompareFunction = CompareFunction.LessEqual;
        }

        BlendState = {
          Enabled = blendEnabled2;
          SourceColorBlendFactor = BlendFactor.SourceAlpha;
          DestinationColorBlendFactor = BlendFactor.OneMinusSourceAlpha;
          SourceAlphaBlendFactor = BlendFactor.One;
          DestinationAlphaBlendFactor = BlendFactor.OneMinusSourceAlpha;
        }

        RasterState = {
          CullMode = rasterStateCullMode2;
          DepthBias = 0.2;
          SlopeScaledDepthBias = 0.9;
        }

        StencilState = {
          Enabled = false;
          Mask = 2.5;
          WriteMask = 0.64;
          CompareFunctionFront = CompareFunction.Greater;
          PassOperationBack = StencilOperation.Keep;
        }
      }
    }
  }