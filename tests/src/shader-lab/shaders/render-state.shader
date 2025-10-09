Shader "render-state-test" {
    // Global Shader-level variables and render states
    Bool globalDepthWrite;

    // Shader-level render state (inherited by all SubShaders and Passes)
    DepthState = {
      WriteEnabled = globalDepthWrite;  // Variable at shader level
      Enabled = true;                   // Constant at shader level
    }

    SubShader "Default" {
      // SubShader-level variables
      Bool subShaderBlendEnabled;

      // SubShader-level render state (inherited by all Passes)
      BlendState = {
        Enabled = subShaderBlendEnabled; // Variable at SubShader level
        SourceColorBlendFactor = BlendFactor.SourceAlpha; // Constant at SubShader level
      }
      Pass "Forward Pass" {
        Tags { LightMode = "ForwardBase", ReplacementTag = "Opaque", pipelineStage = "DepthOnly"}

        // Pass-level variables
        RenderQueueType renderQueueType;
        Bool depthWriteEnabled;

        // Traditional syntax: declare then assign
        DepthState customDepthState {
          WriteEnabled = depthWriteEnabled;  // Pass variable (overrides inherited "globalDepthWrite")
        }
        DepthState = customDepthState;  // Pass assignment (overrides inherited DepthState)
        // Result: WriteEnabled = depthWriteEnabled, Enabled = true (inherited from Shader level)

        // Pass-level BlendState (overrides inherited SubShader BlendState)
        BlendState customBlendState {
          Enabled[0] = true;  // Pass constant (overrides inherited "subShaderBlendEnabled" variable)
          ColorWriteMask[0] = 0.8;  // New property at Pass level
          BlendColor = Color(1.0, 1.0, 1.0, 1.0);  // New property at Pass level
          AlphaBlendOperation = BlendOperation.Max;  // New property at Pass level
        }
        BlendState = customBlendState;
        // Result: Enabled = true (Pass override), SourceColorBlendFactor = SourceAlpha (inherited), plus new properties

        // Pass-level StencilState (new, not inherited)
        StencilState customStencilState {
          Enabled = true;
          Mask = 1.3;
          WriteMask = 0.32;
          CompareFunctionFront = CompareFunction.Less;
          PassOperationBack = StencilOperation.Zero;
        }
        StencilState = customStencilState;

        RenderQueueType = renderQueueType;
      }

      Pass "Syntax Sugar Pass" {
        // Pass-level variables
        Bool depthWriteEnabled2;

        // Syntax sugar: direct assignment (overrides inherited DepthState)
        DepthState = {
          WriteEnabled = depthWriteEnabled2;  // Pass variable (overrides inherited "globalDepthWrite")
          Enabled = true;  // Pass constant (same as inherited, but explicit override)
          CompareFunction = CompareFunction.LessEqual;  // New property at Pass level
        }
        // Result: WriteEnabled = depthWriteEnabled2, Enabled = true, CompareFunction = LessEqual

        // Syntax sugar: BlendState (overrides inherited SubShader BlendState)
        BlendState = {
          Enabled = true;  // Pass constant (overrides inherited "subShaderBlendEnabled" variable)
          SourceColorBlendFactor = BlendFactor.SourceAlpha;  // Pass constant (same as inherited)
          DestinationColorBlendFactor = BlendFactor.OneMinusSourceAlpha;  // New property at Pass level
        }
        // Result: Enabled = true (Pass override), SourceColorBlendFactor = SourceAlpha (Pass override), plus new property
      }

      Pass "Override Test Pass" {
        // Pass-level variables
        Bool depthWriteVar;
        Bool blendEnabledVar;

        // Test: Variable → Constant override
        DepthState = {
          WriteEnabled = depthWriteVar;   // Variable (first assignment)
          Enabled = false;                // Constant
        }

        DepthState = {
          WriteEnabled = true;            // Constant overrides variable
          Enabled = true;                 // Constant overrides constant
          CompareFunction = CompareFunction.Greater; // New constant
        }
        // Result: WriteEnabled = true (constant), Enabled = true (constant), CompareFunction = Greater

        // Test: Constant → Variable override
        BlendState = {
          Enabled = true;                 // Constant (first assignment)
          SourceColorBlendFactor = BlendFactor.One; // Constant
        }

        BlendState = {
          Enabled = blendEnabledVar;      // Variable overrides constant
          SourceColorBlendFactor = BlendFactor.SourceAlpha; // Constant overrides constant
          DestinationColorBlendFactor = BlendFactor.OneMinusSourceAlpha; // New constant
        }
        // Result: Enabled = blendEnabledVar (variable), SourceColorBlendFactor = SourceAlpha, DestinationColorBlendFactor = OneMinusSourceAlpha
      }
    }
  }