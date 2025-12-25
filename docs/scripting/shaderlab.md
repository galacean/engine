# ShaderLab System

ShaderLab is Galacean's advanced shader authoring system that provides a high-level wrapper around GLSL, enabling developers to write custom shaders with enhanced productivity and maintainability. It combines familiar GLSL syntax with additional abstractions for material properties, rendering configurations, and cross-platform compatibility.

The ShaderLab system includes:
- **ShaderLab Compiler**: Advanced shader compilation with macro processing and optimization
- **Shader Syntax**: High-level shader language with GLSL compatibility
- **Material Integration**: Seamless integration with Galacean's material system
- **Shader Variants**: Dynamic compilation with macro-based feature toggling
- **Cross-Platform Support**: Automatic GLSL ES generation for web and mobile platforms

## Quick Start

```ts
import { WebGLEngine, Shader } from "@galacean/engine";
import { ShaderLab } from "@galacean/engine-shaderlab";

// Create engine with ShaderLab support
const shaderLab = new ShaderLab();
const engine = await WebGLEngine.create({ 
  canvas: "canvas", 
  shaderLab 
});

// Create shader using ShaderLab syntax
const customShader = Shader.create(`
Shader "Custom/MyShader" {
  Properties {
    material_BaseColor("Base Color", Color) = (1, 1, 1, 1);
    material_BaseTexture("Base Texture", Texture2D);
    material_Metallic("Metallic", Range(0, 1)) = 0.5;
    material_Roughness("Roughness", Range(0, 1)) = 0.5;
  }

  SubShader "Default" {
    Tags { "RenderType" = "Opaque" }

    Pass "ForwardPass" {
      Tags { "LightMode" = "Forward" }

      struct Attributes {
        vec3 POSITION;
        vec2 TEXCOORD_0;
        vec3 NORMAL;
      };

      struct Varyings {
        vec2 uv;
        vec3 normalWS;
        vec3 positionWS;
      };

      VertexShader = vert;
      FragmentShader = frag;

      Varyings vert(Attributes attr) {
        Varyings v;
        
        vec4 positionCS = renderer_MVPMat * vec4(attr.POSITION, 1.0);
        gl_Position = positionCS;
        
        v.uv = attr.TEXCOORD_0;
        v.normalWS = renderer_NormalMat * attr.NORMAL;
        v.positionWS = (renderer_ModelMat * vec4(attr.POSITION, 1.0)).xyz;
        
        return v;
      }

      vec4 frag(Varyings v) : SV_Target {
        vec4 baseColor = material_BaseColor;
        
        #ifdef MATERIAL_HAS_BASETEXTURE
          baseColor *= texture2D(material_BaseTexture, v.uv);
        #endif
        
        vec3 normal = normalize(v.normalWS);
        vec3 lightDir = normalize(scene_DirectionalLightDirection);
        float NdotL = max(dot(normal, lightDir), 0.0);
        
        vec3 finalColor = baseColor.rgb * NdotL;
        return vec4(finalColor, baseColor.a);
      }
    }
  }
}
`);

// Use shader with material
const material = new Material(engine, customShader);
material.shaderData.setColor("material_BaseColor", new Color(1, 0.5, 0.2, 1));
```

## ShaderLab Syntax Structure

ShaderLab follows a hierarchical structure with clear separation of concerns:

```glsl
Shader "ShaderName" {
  Properties {
    // Material property declarations
  }
  
  Editor {
    // Custom inspector UI (optional)
  }
  
  SubShader "SubShaderName" {
    Tags { /* SubShader tags */ }
    
    Pass "PassName" {
      Tags { /* Pass tags */ }
      
      // Render state configuration
      BlendState = customBlendState;
      DepthState = customDepthState;
      RasterState = customRasterState;
      
      // Shader entry points
      VertexShader = vertexFunction;
      FragmentShader = fragmentFunction;
      
      // GLSL code blocks
      struct Attributes { /* vertex input */ };
      struct Varyings { /* vertex output */ };
      
      // Function definitions
      Varyings vertexFunction(Attributes attr) { /* vertex shader */ }
      vec4 fragmentFunction(Varyings v) : SV_Target { /* fragment shader */ }
    }
  }
}
```

## Properties System

Define material properties with automatic UI generation and type safety:

```glsl
Properties {
  // Basic types
  material_BaseColor("Base Color", Color) = (1, 1, 1, 1);
  material_Metallic("Metallic", Float) = 0.5;
  material_Roughness("Roughness", Range(0, 1)) = 0.5;
  material_EmissionIntensity("Emission Intensity", Range(0, 10)) = 1.0;
  
  // Textures
  material_BaseTexture("Base Texture", Texture2D);
  material_NormalTexture("Normal Map", Texture2D);
  material_MetallicRoughnessTexture("Metallic Roughness", Texture2D);
  material_EmissionTexture("Emission Map", Texture2D);
  
  // Cube textures
  material_EnvironmentTexture("Environment Map", TextureCube);
  
  // Vectors
  material_TilingOffset("Tiling and Offset", Vector4) = (1, 1, 0, 0);
  material_WindDirection("Wind Direction", Vector3) = (1, 0, 0);
  
  // Integers and booleans
  material_LayerCount("Layer Count", Int) = 1;
  material_EnableNormalMap("Enable Normal Map", Boolean) = false;
}
```

### Property Usage in Shaders

```glsl
// Access properties in shader code
vec4 frag(Varyings v) : SV_Target {
  vec4 baseColor = material_BaseColor;
  
  #ifdef MATERIAL_HAS_BASETEXTURE
    vec2 uv = v.uv * material_TilingOffset.xy + material_TilingOffset.zw;
    baseColor *= texture2D(material_BaseTexture, uv);
  #endif
  
  float metallic = material_Metallic;
  float roughness = material_Roughness;
  
  #ifdef MATERIAL_HAS_METALLICROUGHNESSTEXTURE
    vec3 metallicRoughness = texture2D(material_MetallicRoughnessTexture, v.uv).rgb;
    metallic *= metallicRoughness.b;
    roughness *= metallicRoughness.g;
  #endif
  
  return baseColor;
}
```

## Render State Configuration

Configure rendering pipeline state declaratively:

```glsl
Pass "ForwardPass" {
  // Blend state
  BlendState {
    Enabled = true;
    SourceColorBlendFactor = SourceAlpha;
    DestinationColorBlendFactor = OneMinusSourceAlpha;
    SourceAlphaBlendFactor = One;
    DestinationAlphaBlendFactor = OneMinusSourceAlpha;
    ColorBlendOperation = Add;
    AlphaBlendOperation = Add;
    ColorWriteMask = All;
  }
  
  // Depth state
  DepthState {
    Enabled = true;
    WriteEnabled = true;
    CompareFunction = LessEqual;
  }
  
  // Raster state
  RasterState {
    CullMode = Back;
    FillMode = Solid;
    DepthBias = 0;
    SlopeScaledDepthBias = 0;
  }
  
  // Stencil state
  StencilState {
    Enabled = false;
    ReferenceValue = 0;
    Mask = 255;
    WriteMask = 255;
    CompareFunctionFront = Always;
    CompareFunctionBack = Always;
    PassOperationFront = Keep;
    PassOperationBack = Keep;
    FailOperationFront = Keep;
    FailOperationBack = Keep;
    ZFailOperationFront = Keep;
    ZFailOperationBack = Keep;
  }
}
```

## Shader Variants and Macros

Use macros for conditional compilation and feature toggling:

```glsl
Pass "MainPass" {
  // Define shader variants
  #pragma multi_compile _ ENABLE_NORMAL_MAP
  #pragma multi_compile _ ENABLE_EMISSION
  #pragma multi_compile LIGHTMAP_OFF LIGHTMAP_ON
  
  vec4 frag(Varyings v) : SV_Target {
    vec4 color = material_BaseColor;
    
    // Conditional compilation based on macros
    #ifdef ENABLE_NORMAL_MAP
      vec3 normalMap = texture2D(material_NormalTexture, v.uv).rgb * 2.0 - 1.0;
      vec3 normal = normalize(v.tangentToWorld * normalMap);
    #else
      vec3 normal = normalize(v.normalWS);
    #endif
    
    // Lighting calculation
    vec3 lightColor = calculateLighting(normal, v.positionWS);
    color.rgb *= lightColor;
    
    #ifdef ENABLE_EMISSION
      vec3 emission = texture2D(material_EmissionTexture, v.uv).rgb;
      color.rgb += emission * material_EmissionIntensity;
    #endif
    
    #ifdef LIGHTMAP_ON
      vec3 lightmap = texture2D(unity_Lightmap, v.lightmapUV).rgb;
      color.rgb *= lightmap;
    #endif
    
    return color;
  }
}
```

## Built-in Variables and Functions

ShaderLab provides built-in variables and functions for common operations:

### Transform Matrices

```glsl
// Built-in transform matrices
mat4 renderer_ModelMat;        // Model to world matrix
mat4 renderer_ViewMat;         // World to view matrix
mat4 renderer_ProjMat;         // View to projection matrix
mat4 renderer_MVMat;           // Model-view matrix
mat4 renderer_MVPMat;          // Model-view-projection matrix
mat4 renderer_NormalMat;       // Normal transformation matrix

// Usage in vertex shader
Varyings vert(Attributes attr) {
  vec4 positionWS = renderer_ModelMat * vec4(attr.POSITION, 1.0);
  vec4 positionVS = renderer_ViewMat * positionWS;
  vec4 positionCS = renderer_ProjMat * positionVS;
  
  // Or use combined matrix
  gl_Position = renderer_MVPMat * vec4(attr.POSITION, 1.0);
  
  return v;
}
```

### Lighting Variables

```glsl
// Directional light
vec3 scene_DirectionalLightDirection;
vec3 scene_DirectionalLightColor;
float scene_DirectionalLightIntensity;

// Point lights (arrays)
vec3 scene_PointLightPosition[MAX_POINT_LIGHTS];
vec3 scene_PointLightColor[MAX_POINT_LIGHTS];
float scene_PointLightDistance[MAX_POINT_LIGHTS];

// Spot lights (arrays)
vec3 scene_SpotLightPosition[MAX_SPOT_LIGHTS];
vec3 scene_SpotLightDirection[MAX_SPOT_LIGHTS];
vec3 scene_SpotLightColor[MAX_SPOT_LIGHTS];
float scene_SpotLightDistance[MAX_SPOT_LIGHTS];
float scene_SpotLightAngleCos[MAX_SPOT_LIGHTS];

// Ambient lighting
vec3 scene_AmbientLightColor;
float scene_AmbientLightIntensity;
```

### Camera Variables

```glsl
// Camera properties
vec3 camera_Position;          // World space camera position
mat4 camera_ViewMat;           // View matrix
mat4 camera_ProjMat;           // Projection matrix
mat4 camera_VPMat;             // View-projection matrix
vec4 camera_ProjectionParams;  // x: 1 or -1, y: near, z: far, w: 1/far
```

## Advanced Features

### Include System

Organize shader code with include directives:

```glsl
// Common.glsl - shared functions
vec3 calculateLighting(vec3 normal, vec3 worldPos, vec3 viewDir) {
  // Lighting calculation implementation
  return vec3(1.0);
}

vec3 sampleEnvironment(vec3 reflectDir, float roughness) {
  // Environment sampling implementation
  return vec3(0.1);
}

// Main shader file
Shader "Custom/PBRShader" {
  SubShader "Default" {
    Pass "ForwardPass" {
      #include "Common.glsl"
      #include "PBRLighting.glsl"

      vec4 frag(Varyings v) : SV_Target {
        vec3 normal = normalize(v.normalWS);
        vec3 viewDir = normalize(camera_Position - v.positionWS);

        vec3 lighting = calculateLighting(normal, v.positionWS, viewDir);
        vec3 reflection = sampleEnvironment(reflect(-viewDir, normal), material_Roughness);

        return vec4(lighting + reflection, 1.0);
      }
    }
  }
}
```

### Multi-Pass Rendering

Create complex shaders with multiple rendering passes:

```glsl
Shader "Custom/MultiPassShader" {
  SubShader "Default" {
    // Shadow pass
    Pass "ShadowCaster" {
      Tags { "LightMode" = "ShadowCaster" }

      RasterState {
        CullMode = Back;
        DepthBias = 1;
        SlopeScaledDepthBias = 1;
      }

      VertexShader = shadowVert;
      FragmentShader = shadowFrag;

      // Shadow casting implementation
    }

    // Depth pre-pass
    Pass "DepthOnly" {
      Tags { "LightMode" = "DepthOnly" }

      ColorMask = 0; // Don't write to color buffer

      VertexShader = depthVert;
      FragmentShader = depthFrag;

      // Depth-only rendering
    }

    // Main forward pass
    Pass "ForwardPass" {
      Tags { "LightMode" = "Forward" }

      VertexShader = forwardVert;
      FragmentShader = forwardFrag;

      // Main rendering implementation
    }
  }
}
```

### Custom Editor Integration

Define custom material inspector UI:

```glsl
Shader "Custom/UIShader" {
  Properties {
    [Header(Base Settings)]
    material_BaseColor("Base Color", Color) = (1, 1, 1, 1);
    material_BaseTexture("Base Texture", Texture2D);

    [Header(Surface Settings)]
    [Toggle] material_EnableNormalMap("Enable Normal Map", Boolean) = false;
    material_NormalTexture("Normal Map", Texture2D);
    material_NormalScale("Normal Scale", Range(0, 2)) = 1.0;

    [Header(Advanced)]
    [Enum(Off, 0, Front, 1, Back, 2)] material_CullMode("Cull Mode", Int) = 2;
    [PowerSlider(2.0)] material_Shininess("Shininess", Range(0.01, 1)) = 0.078125;
  }

  Editor {
    UI_BaseColor = "Base Color";
    UI_BaseTexture = "Base Texture";
    UI_EnableNormalMap = "Enable Normal Map";
    UI_NormalTexture = "Normal Map";
    UI_NormalScale = "Normal Scale";
  }

  // Shader implementation...
}
```

## Compilation and Optimization

### ShaderLab Compiler Features

```ts
// Create ShaderLab with different modes
import { ShaderLab } from "@galacean/engine-shaderlab";
import { ShaderLab as ShaderLabVerbose } from "@galacean/engine-shaderlab/verbose";

// Release mode - optimized for performance
const shaderLabRelease = new ShaderLab();

// Verbose mode - detailed error reporting for debugging
const shaderLabVerbose = new ShaderLabVerbose();

// Use verbose mode during development
const engine = await WebGLEngine.create({
  canvas: "canvas",
  shaderLab: shaderLabVerbose
});
```

### Macro Processing

```ts
// Define macros programmatically
const shader = Shader.create(shaderSource);
const material = new Material(engine, shader);

// Enable/disable features via macros
material.shaderData.enableMacro("ENABLE_NORMAL_MAP");
material.shaderData.enableMacro("LIGHTMAP_ON");
material.shaderData.disableMacro("ENABLE_EMISSION");

// Set macro values
material.shaderData.setMacro("LIGHT_COUNT", "4");
material.shaderData.setMacro("QUALITY_LEVEL", "HIGH");
```

### Performance Optimization

```glsl
Pass "OptimizedPass" {
  // Use precision qualifiers for mobile
  precision mediump float;
  precision lowp sampler2D;

  // Optimize vertex attributes
  struct Attributes {
    vec3 POSITION;
    vec2 TEXCOORD_0;
    #ifdef ENABLE_NORMAL_MAP
      vec3 NORMAL;
      vec4 TANGENT;
    #endif
  };

  vec4 frag(Varyings v) : SV_Target {
    // Use half precision for intermediate calculations on mobile
    #ifdef MOBILE_PLATFORM
      mediump vec4 color = material_BaseColor;
      mediump vec3 normal = normalize(v.normalWS);
    #else
      vec4 color = material_BaseColor;
      vec3 normal = normalize(v.normalWS);
    #endif

    // Conditional texture sampling
    #ifdef MATERIAL_HAS_BASETEXTURE
      color *= texture2D(material_BaseTexture, v.uv);
    #endif

    return color;
  }
}
```

## Error Handling and Debugging

### Compilation Error Reporting

```ts
try {
  const shader = Shader.create(shaderSource);
} catch (error) {
  console.error("Shader compilation failed:", error);

  // In verbose mode, get detailed error information
  if (error.includes("line")) {
    const lineNumber = error.match(/line (\d+)/)?.[1];
    console.error(`Error on line ${lineNumber}`);
  }
}
```

### Debugging Techniques

```glsl
Pass "DebugPass" {
  vec4 frag(Varyings v) : SV_Target {
    // Debug normal vectors
    #ifdef DEBUG_NORMALS
      return vec4(normalize(v.normalWS) * 0.5 + 0.5, 1.0);
    #endif

    // Debug UV coordinates
    #ifdef DEBUG_UVS
      return vec4(v.uv, 0.0, 1.0);
    #endif

    // Debug lighting
    #ifdef DEBUG_LIGHTING
      vec3 lightDir = normalize(scene_DirectionalLightDirection);
      float NdotL = max(dot(normalize(v.normalWS), lightDir), 0.0);
      return vec4(vec3(NdotL), 1.0);
    #endif

    // Normal rendering
    return calculateFinalColor(v);
  }
}
```

## API Reference

```apidoc
ShaderLab:
  Constructor:
    constructor()
      - Creates a ShaderLab compiler instance.

  Methods:
    _parseShaderSource(sourceCode: string): IShaderSource
      - Parse shader source code to get structure.
    _parseShaderPass(source: string, vertexEntry: string, fragmentEntry: string, backend: ShaderLanguage, basePathForIncludeKey: string): IShaderProgramSource
      - Parse and compile shader pass source code.
    _parseMacros(content: string, macros: ShaderMacro[]): string
      - Process macro definitions in shader code.

Shader:
  Static Methods:
    create(shaderSource: string, platformTarget?: ShaderLanguage, path?: string): Shader
      - Create shader from ShaderLab source code.
    create(name: string, vertexSource: string, fragmentSource: string): Shader
      - Create shader from GLSL source code.
    create(name: string, subShaders: SubShader[]): Shader
      - Create shader with multiple SubShaders.
    find(name: string): Shader
      - Find existing shader by name.

  Properties:
    name: string
      - Shader name identifier.
    subShaders: SubShader[]
      - Array of SubShader objects.

SubShader:
  Constructor:
    constructor(name: string, passes: ShaderPass[])
      - Create SubShader with passes.

  Properties:
    name: string
      - SubShader name.
    passes: ShaderPass[]
      - Array of shader passes.
    tags: Record<string, string>
      - SubShader tags.

  Methods:
    setTag(key: string, value: string): void
      - Set SubShader tag.

ShaderPass:
  Constructor:
    constructor(vertexSource: string, fragmentSource: string, tags?: Record<string, string>)
      - Create shader pass with vertex and fragment shaders.

  Properties:
    name: string
      - Pass name.
    tags: Record<string, string>
      - Pass tags.
    renderState: RenderState
      - Render state configuration.

  Methods:
    setTag(key: string, value: string): void
      - Set pass tag.

Material:
  Properties:
    shader: Shader
      - Associated shader.
    shaderData: ShaderData
      - Shader property data.

  Methods:
    setShader(shader: Shader): void
      - Set material shader.

ShaderData:
  Methods:
    enableMacro(name: string): void
      - Enable shader macro.
    disableMacro(name: string): void
      - Disable shader macro.
    setMacro(name: string, value: string): void
      - Set macro value.
    setFloat(name: string, value: number): void
      - Set float property.
    setColor(name: string, value: Color): void
      - Set color property.
    setTexture(name: string, value: Texture): void
      - Set texture property.
    setVector4(name: string, value: Vector4): void
      - Set Vector4 property.
```

## ShaderLab Syntax Reference

### Property Types

```glsl
Properties {
  // Numeric types
  floatProperty("Float", Float) = 1.0;
  rangeProperty("Range", Range(0, 1)) = 0.5;
  intProperty("Integer", Int) = 1;

  // Vector types
  vector2Property("Vector2", Vector2) = (1, 0);
  vector3Property("Vector3", Vector3) = (1, 0, 0);
  vector4Property("Vector4", Vector4) = (1, 0, 0, 1);
  colorProperty("Color", Color) = (1, 1, 1, 1);

  // Texture types
  texture2DProperty("Texture2D", Texture2D);
  textureCubeProperty("TextureCube", TextureCube);

  // Boolean type
  boolProperty("Boolean", Boolean) = false;
}
```

### Render State Options

```glsl
// Blend factors
SourceColorBlendFactor = Zero | One | SourceColor | OneMinusSourceColor |
                        DestinationColor | OneMinusDestinationColor |
                        SourceAlpha | OneMinusSourceAlpha |
                        DestinationAlpha | OneMinusDestinationAlpha;

// Compare functions
CompareFunction = Never | Less | Equal | LessEqual | Greater |
                 NotEqual | GreaterEqual | Always;

// Cull modes
CullMode = Off | Front | Back;

// Blend operations
BlendOperation = Add | Subtract | ReverseSubtract | Min | Max;

// Color write masks
ColorWriteMask = None | Red | Green | Blue | Alpha | All;
```

### Built-in Semantic Attributes

```glsl
struct Attributes {
  vec3 POSITION;      // Vertex position
  vec3 NORMAL;        // Vertex normal
  vec4 TANGENT;       // Vertex tangent
  vec2 TEXCOORD_0;    // Primary UV coordinates
  vec2 TEXCOORD_1;    // Secondary UV coordinates
  vec4 COLOR_0;       // Vertex color
  vec4 JOINTS_0;      // Bone indices for skinning
  vec4 WEIGHTS_0;     // Bone weights for skinning
};

struct Varyings {
  vec4 SV_POSITION;   // Clip space position (gl_Position)
  vec2 uv;           // Custom varying
  vec3 normalWS;     // World space normal
  vec3 positionWS;   // World space position
};
```

## Best Practices

- **Organization**: Use clear naming conventions and organize code with includes
- **Performance**: Use appropriate precision qualifiers and conditional compilation
- **Debugging**: Leverage verbose mode during development for better error reporting
- **Variants**: Use macros judiciously to avoid shader explosion
- **Properties**: Group related properties and use descriptive names
- **Render States**: Configure render states explicitly rather than relying on defaults
- **Cross-Platform**: Test shaders on target platforms and use appropriate precision
- **Optimization**: Profile shader performance and optimize hot paths
- **Documentation**: Comment complex shader logic and algorithms
- **Version Control**: Use meaningful commit messages for shader changes
