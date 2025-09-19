# Shader

Galacean's `Shader` class is the core of the rendering pipeline, defining how geometry is processed and pixels are colored through programmable vertex and fragment shaders. Shaders combine with materials to create the final visual appearance of 3D objects, supporting everything from simple color rendering to complex physically-based lighting and custom visual effects.

## Overview

The Shader system provides comprehensive graphics programming capabilities:

- **Multi-Pass Rendering**: Support for complex shaders with multiple rendering passes
- **Shader Variants**: Dynamic shader compilation with macro-based feature toggling
- **Cross-Platform Support**: GLSL ES support for web and mobile platforms
- **ShaderLab Integration**: Advanced shader authoring with the Galacean ShaderLab system
- **Property System**: Type-safe shader property binding with automatic validation
- **Macro System**: Conditional compilation for feature-rich shaders
- **Resource Management**: Automatic shader compilation caching and reference counting

Shaders work closely with Materials to define surface properties and rendering behavior.

## Quick Start

```ts
import { WebGLEngine, Shader, Material } from "@galacean/engine";

const engine = await WebGLEngine.create({ canvas: "canvas" });

// Create simple vertex and fragment shaders
const vertexSource = `
  attribute vec3 POSITION;
  attribute vec2 TEXCOORD_0;
  
  uniform mat4 renderer_MVPMat;
  
  varying vec2 v_uv;
  
  void main() {
    gl_Position = renderer_MVPMat * vec4(POSITION, 1.0);
    v_uv = TEXCOORD_0;
  }
`;

const fragmentSource = `
  precision mediump float;
  
  uniform vec4 material_BaseColor;
  uniform sampler2D material_BaseTexture;
  
  varying vec2 v_uv;
  
  void main() {
    vec4 textureColor = texture2D(material_BaseTexture, v_uv);
    gl_FragColor = textureColor * material_BaseColor;
  }
`;

// Create shader
const customShader = Shader.create("CustomShader", vertexSource, fragmentSource);

// Use with material
const material = new Material(engine, customShader);
material.shaderData.setColor("material_BaseColor", new Color(1, 0, 0, 1));
```

## Shader Creation Methods

### Basic Vertex/Fragment Shader

```ts
// Create shader with vertex and fragment source
const basicShader = Shader.create("BasicShader", vertexSource, fragmentSource);

// The engine automatically creates a single SubShader with one ShaderPass
console.log("SubShaders:", basicShader.subShaders.length); // 1
console.log("Passes:", basicShader.subShaders[0].passes.length); // 1
```

### Multi-Pass Shaders

```ts
// Multi-pass shaders require ShaderLab syntax or engine source modification
// The following is conceptual - actual implementation requires internal APIs

// For multi-pass effects, use ShaderLab syntax:
const shaderLabSource = `
Shader "MultiPassShader" {
  SubShader "Default" {
    Pass "ShadowPass" {
      // Shadow pass implementation
    }
    Pass "ForwardPass" {
      // Forward rendering pass
    }
    Pass "OutlinePass" {
      // Outline effect pass
    }
  }
}
`;

const multiPassShader = Shader.create(shaderLabSource);

// Access individual passes (read-only)
multiPassShader.subShaders[0].passes.forEach((pass, index) => {
  console.log(`Pass ${index}: ${pass.name}`);
});
```

### SubShader System

```ts
// Multiple SubShaders require ShaderLab syntax for proper platform targeting
// The following shows the conceptual structure using ShaderLab:

const adaptiveShaderSource = `
Shader "AdaptiveShader" {
  SubShader "Desktop" {
    Tags { "RenderPipeline" = "Forward", "Queue" = "Opaque" }
    Pass "HighQuality" {
      // Desktop-optimized shader code
      VertexShader = desktopVert;
      FragmentShader = desktopFrag;
    }
  }

  SubShader "Mobile" {
    Tags { "RenderPipeline" = "Forward", "Queue" = "Opaque", "LightMode" = "ForwardBase" }
    Pass "LowQuality" {
      // Mobile-optimized shader code
      VertexShader = mobileVert;
      FragmentShader = mobileFrag;
    }
  }
}
`;

const adaptiveShader = Shader.create(adaptiveShaderSource);
```

### ShaderLab Integration

```ts
// Advanced shader creation using ShaderLab (requires @galacean/engine-shaderlab)
import { ShaderLab } from "@galacean/engine-shaderlab";

// Create engine with ShaderLab support
const engine = await WebGLEngine.create({ 
  canvas: "canvas",
  shaderLab: new ShaderLab()
});

// Create shader from ShaderLab source
const shaderLabSource = `
Shader "Custom/MyShader" {
  SubShader {
    Tags { "RenderPipeline" = "Forward" }
    
    Pass {
      Tags { "LightMode" = "ForwardBase" }
      
      HLSLPROGRAM
      #pragma vertex vert
      #pragma fragment frag
      
      #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
      
      struct Attributes {
        float4 positionOS : POSITION;
        float2 uv : TEXCOORD0;
      };
      
      struct Varyings {
        float4 positionHCS : SV_POSITION;
        float2 uv : TEXCOORD0;
      };
      
      Varyings vert(Attributes input) {
        Varyings output;
        output.positionHCS = TransformObjectToHClip(input.positionOS.xyz);
        output.uv = input.uv;
        return output;
      }
      
      float4 frag(Varyings input) : SV_Target {
        return float4(input.uv, 0.0, 1.0);
      }
      ENDHLSL
    }
  }
}
`;

const shaderLabShader = Shader.create(shaderLabSource);
```

## Shader Properties and Uniforms

### Built-in Engine Properties

Galacean provides built-in shader properties for common rendering needs:

```glsl
// Transform matrices (automatically provided)
uniform mat4 renderer_MVPMat;        // Model-View-Projection matrix
uniform mat4 renderer_MVMat;         // Model-View matrix  
uniform mat4 renderer_ModelMat;      // Model matrix (world transform)
uniform mat4 renderer_NormalMat;     // Normal transformation matrix

// Camera properties
uniform vec3 camera_Position;        // Camera world position
uniform mat4 camera_ViewMat;         // View matrix
uniform mat4 camera_ProjMat;         // Projection matrix

// Time and frame information
uniform float engine_Time;           // Engine total time
uniform float engine_DeltaTime;      // Frame delta time
uniform float engine_FrameCount;     // Frame number

// Lighting (when available)
uniform vec3 scene_AmbientLight;     // Ambient light color
uniform int scene_DirectLightCount;  // Number of directional lights
uniform int scene_PointLightCount;   // Number of point lights
uniform int scene_SpotLightCount;    // Number of spot lights
```

### Custom Shader Properties

```ts
// Define custom properties in shader
const customVertexSource = `
  attribute vec3 POSITION;
  attribute vec2 TEXCOORD_0;
  
  uniform mat4 renderer_MVPMat;
  uniform float material_WaveAmplitude;    // Custom property
  uniform float material_WaveFrequency;    // Custom property
  uniform float engine_Time;               // Built-in time
  
  varying vec2 v_uv;
  
  void main() {
    vec3 pos = POSITION;
    // Apply wave animation using custom properties
    pos.y += sin(pos.x * material_WaveFrequency + engine_Time) * material_WaveAmplitude;
    
    gl_Position = renderer_MVPMat * vec4(pos, 1.0);
    v_uv = TEXCOORD_0;
  }
`;

const customFragmentSource = `
  precision mediump float;
  
  uniform vec4 material_BaseColor;
  uniform vec3 material_EmissiveColor;
  uniform sampler2D material_BaseTexture;
  uniform sampler2D material_NormalTexture;
  
  varying vec2 v_uv;
  
  void main() {
    vec4 baseColor = texture2D(material_BaseTexture, v_uv);
    vec3 normal = texture2D(material_NormalTexture, v_uv).xyz * 2.0 - 1.0;
    
    vec3 finalColor = baseColor.rgb * material_BaseColor.rgb + material_EmissiveColor;
    gl_FragColor = vec4(finalColor, baseColor.a * material_BaseColor.a);
  }
`;

// Create shader and set properties through material
const shader = Shader.create("WaveShader", customVertexSource, customFragmentSource);
const material = new Material(engine, shader);

// Set custom properties
material.shaderData.setFloat("material_WaveAmplitude", 0.5);
material.shaderData.setFloat("material_WaveFrequency", 2.0);
material.shaderData.setColor("material_BaseColor", new Color(1, 0.5, 0.2, 1));
material.shaderData.setVector3("material_EmissiveColor", new Vector3(0.1, 0.1, 0.0));
```

## Shader Macros and Variants

### Conditional Compilation

```glsl
// Vertex shader with macro support
attribute vec3 POSITION;
attribute vec2 TEXCOORD_0;

#ifdef RENDERER_HAS_NORMAL
  attribute vec3 NORMAL;
  varying vec3 v_normal;
#endif

#ifdef RENDERER_HAS_TANGENT
  attribute vec4 TANGENT;
  varying vec3 v_tangent;
  varying vec3 v_bitangent;
#endif

uniform mat4 renderer_MVPMat;
uniform mat4 renderer_ModelMat;
uniform mat4 renderer_NormalMat;

varying vec2 v_uv;

void main() {
  gl_Position = renderer_MVPMat * vec4(POSITION, 1.0);
  v_uv = TEXCOORD_0;
  
  #ifdef RENDERER_HAS_NORMAL
    v_normal = normalize((renderer_NormalMat * vec4(NORMAL, 0.0)).xyz);
  #endif
  
  #ifdef RENDERER_HAS_TANGENT
    v_tangent = normalize((renderer_ModelMat * vec4(TANGENT.xyz, 0.0)).xyz);
    v_bitangent = cross(v_normal, v_tangent) * TANGENT.w;
  #endif
}
```

```glsl
// Fragment shader with feature macros
precision mediump float;

uniform vec4 material_BaseColor;
uniform sampler2D material_BaseTexture;

#ifdef MATERIAL_HAS_NORMALTEXTURE
  uniform sampler2D material_NormalTexture;
  uniform float material_NormalIntensity;
#endif

#ifdef MATERIAL_HAS_EMISSIVETEXTURE
  uniform sampler2D material_EmissiveTexture;
  uniform vec3 material_EmissiveColor;
#endif

#ifdef USE_VERTEX_COLOR
  varying vec4 v_color;
#endif

varying vec2 v_uv;

#ifdef RENDERER_HAS_NORMAL
  varying vec3 v_normal;
#endif

void main() {
  vec4 baseColor = texture2D(material_BaseTexture, v_uv) * material_BaseColor;
  
  #ifdef USE_VERTEX_COLOR
    baseColor *= v_color;
  #endif
  
  vec3 finalColor = baseColor.rgb;
  
  #ifdef MATERIAL_HAS_EMISSIVETEXTURE
    vec3 emissive = texture2D(material_EmissiveTexture, v_uv).rgb * material_EmissiveColor;
    finalColor += emissive;
  #endif
  
  gl_FragColor = vec4(finalColor, baseColor.a);
}
```

### Managing Shader Variants

```ts
// Enable shader macros through material
const material = new Material(engine, shader);
const shaderData = material.shaderData;

// Enable different features
shaderData.enableMacro("RENDERER_HAS_NORMAL");
shaderData.enableMacro("MATERIAL_HAS_NORMALTEXTURE");
shaderData.enableMacro("USE_VERTEX_COLOR");

// Disable features
shaderData.disableMacro("MATERIAL_HAS_EMISSIVETEXTURE");

// Check macro state
if (shaderData.hasMacro("RENDERER_HAS_NORMAL")) {
  console.log("Normal mapping is enabled");
}

// Compile specific shader variant
const macros = ["RENDERER_HAS_NORMAL", "MATERIAL_HAS_NORMALTEXTURE"];
const isValid = shader.compileVariant(engine, macros);
console.log("Shader variant is valid:", isValid);
```

### Macro Values

```ts
// Create macros with specific values
const lightCountMacro = ShaderMacro.getByName("DIRECTIONAL_LIGHT_COUNT", "4");
const qualityMacro = ShaderMacro.getByName("QUALITY_LEVEL", "HIGH");

// Use in shader
shaderData.enableMacro(lightCountMacro);
shaderData.enableMacro(qualityMacro);
```

```glsl
// Shader code using macro values
#if DIRECTIONAL_LIGHT_COUNT > 0
  uniform vec3 scene_DirectionalLightDirection[DIRECTIONAL_LIGHT_COUNT];
  uniform vec3 scene_DirectionalLightColor[DIRECTIONAL_LIGHT_COUNT];
  
  for (int i = 0; i < DIRECTIONAL_LIGHT_COUNT; i++) {
    // Process directional lights
  }
#endif

#if QUALITY_LEVEL == HIGH
  // High quality rendering path
#elif QUALITY_LEVEL == MEDIUM  
  // Medium quality rendering path
#else
  // Low quality rendering path
#endif
```

## Advanced Shader Techniques

### Custom Vertex Attributes

```glsl
// Define custom vertex attributes
attribute vec3 POSITION;
attribute vec3 NORMAL;
attribute vec2 TEXCOORD_0;
attribute vec2 TEXCOORD_1;    // Second UV set
attribute vec4 COLOR_0;       // Vertex colors
attribute vec4 JOINTS_0;      // Bone indices for skinning
attribute vec4 WEIGHTS_0;     // Bone weights for skinning

// Custom attributes for special effects
attribute float a_customData; // Custom per-vertex data

varying vec2 v_uv;
varying vec2 v_uv2;
varying vec4 v_color;
varying float v_customData;

void main() {
  gl_Position = renderer_MVPMat * vec4(POSITION, 1.0);
  v_uv = TEXCOORD_0;
  v_uv2 = TEXCOORD_1;
  v_color = COLOR_0;
  v_customData = a_customData;
}
```

### Instanced Rendering Support

```glsl
// Vertex shader with instancing
attribute vec3 POSITION;
attribute vec2 TEXCOORD_0;

// Instance attributes (if using instanced rendering)
attribute mat4 a_instanceMatrix;
attribute vec4 a_instanceColor;

uniform mat4 camera_ViewMat;
uniform mat4 camera_ProjMat;

varying vec2 v_uv;
varying vec4 v_instanceColor;

void main() {
  vec4 worldPosition = a_instanceMatrix * vec4(POSITION, 1.0);
  gl_Position = camera_ProjMat * camera_ViewMat * worldPosition;
  
  v_uv = TEXCOORD_0;
  v_instanceColor = a_instanceColor;
}
```

### Advanced Lighting Models

```glsl
// PBR lighting implementation
precision mediump float;

struct Material {
  vec3 albedo;
  float metallic;
  float roughness;
  vec3 normal;
  float ao;
  vec3 emissive;
};

struct Light {
  vec3 direction;
  vec3 color;
  float intensity;
};

// PBR functions
float DistributionGGX(vec3 N, vec3 H, float roughness) {
  float a = roughness * roughness;
  float a2 = a * a;
  float NdotH = max(dot(N, H), 0.0);
  float NdotH2 = NdotH * NdotH;
  
  float num = a2;
  float denom = (NdotH2 * (a2 - 1.0) + 1.0);
  denom = 3.14159265359 * denom * denom;
  
  return num / denom;
}

float GeometrySchlickGGX(float NdotV, float roughness) {
  float r = (roughness + 1.0);
  float k = (r * r) / 8.0;
  
  float num = NdotV;
  float denom = NdotV * (1.0 - k) + k;
  
  return num / denom;
}

vec3 fresnelSchlick(float cosTheta, vec3 F0) {
  return F0 + (1.0 - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

vec3 calculatePBR(Material material, Light light, vec3 viewDir) {
  vec3 lightDir = normalize(-light.direction);
  vec3 halfwayDir = normalize(lightDir + viewDir);
  
  // Calculate F0 (surface reflection at zero incidence)
  vec3 F0 = vec3(0.04);
  F0 = mix(F0, material.albedo, material.metallic);
  
  // Cook-Torrance BRDF
  float NDF = DistributionGGX(material.normal, halfwayDir, material.roughness);
  float G = GeometrySchlickGGX(max(dot(material.normal, viewDir), 0.0), material.roughness) *
            GeometrySchlickGGX(max(dot(material.normal, lightDir), 0.0), material.roughness);
  vec3 F = fresnelSchlick(max(dot(halfwayDir, viewDir), 0.0), F0);
  
  vec3 kS = F;
  vec3 kD = vec3(1.0) - kS;
  kD *= 1.0 - material.metallic;
  
  vec3 numerator = NDF * G * F;
  float denominator = 4.0 * max(dot(material.normal, viewDir), 0.0) * 
                      max(dot(material.normal, lightDir), 0.0) + 0.0001;
  vec3 specular = numerator / denominator;
  
  float NdotL = max(dot(material.normal, lightDir), 0.0);
  return (kD * material.albedo / 3.14159265359 + specular) * light.color * light.intensity * NdotL;
}

void main() {
  // Setup material properties from textures and uniforms
  Material mat;
  mat.albedo = texture2D(material_BaseTexture, v_uv).rgb * material_BaseColor.rgb;
  mat.metallic = material_Metallic;
  mat.roughness = material_Roughness;
  mat.normal = normalize(v_normal);
  mat.ao = 1.0;
  mat.emissive = material_EmissiveColor;
  
  // Calculate lighting
  vec3 viewDir = normalize(camera_Position - v_worldPos);
  vec3 color = vec3(0.0);
  
  // Process directional lights
  for (int i = 0; i < scene_DirectLightCount; i++) {
    Light light;
    light.direction = scene_DirectionalLightDirection[i];
    light.color = scene_DirectionalLightColor[i];
    light.intensity = 1.0;
    
    color += calculatePBR(mat, light, viewDir);
  }
  
  // Add ambient lighting
  vec3 ambient = scene_AmbientLight * mat.albedo * mat.ao;
  color += ambient;
  
  // Add emissive
  color += mat.emissive;
  
  gl_FragColor = vec4(color, material_BaseColor.a);
}
```

## Performance Optimization

### Shader Compilation Caching

```ts
class ShaderManager {
  private compiledVariants = new Map<string, boolean>();
  
  precompileShaderVariants(shader: Shader, engine: Engine): void {
    // Common macro combinations for this shader
    const variantConfigurations = [
      [],                                          // Basic variant
      ["RENDERER_HAS_NORMAL"],                    // With normals
      ["RENDERER_HAS_NORMAL", "MATERIAL_HAS_NORMALTEXTURE"], // With normal mapping
      ["USE_VERTEX_COLOR"],                       // With vertex colors
      ["MATERIAL_HAS_EMISSIVETEXTURE"],          // With emissive
    ];
    
    variantConfigurations.forEach(macros => {
      const variantKey = this.getVariantKey(shader.name, macros);
      
      if (!this.compiledVariants.has(variantKey)) {
        const isValid = shader.compileVariant(engine, macros);
        this.compiledVariants.set(variantKey, isValid);
        
        if (isValid) {
          console.log(`Precompiled shader variant: ${variantKey}`);
        } else {
          console.warn(`Failed to compile shader variant: ${variantKey}`);
        }
      }
    });
  }
  
  private getVariantKey(shaderName: string, macros: string[]): string {
    return `${shaderName}_${macros.sort().join('_')}`;
  }
}
```

### Shader Complexity Management

```ts
// Conditional feature compilation based on platform
class PlatformShaderBuilder {
  createShaderForPlatform(platform: 'desktop' | 'mobile'): Shader {
    const isMobile = platform === 'mobile';
    
    let vertexSource = this.getBaseVertexShader();
    let fragmentSource = this.getBaseFragmentShader();
    
    // Adjust quality based on platform
    if (isMobile) {
      // Reduce precision for mobile
      fragmentSource = fragmentSource.replace(
        'precision mediump float;',
        'precision lowp float;'
      );
      
      // Disable expensive features
      fragmentSource = this.disableFeature(fragmentSource, 'ADVANCED_LIGHTING');
      fragmentSource = this.disableFeature(fragmentSource, 'REFLECTION_PROBES');
    } else {
      // Enable advanced features for desktop
      vertexSource = this.enableFeature(vertexSource, 'VERTEX_DISPLACEMENT');
      fragmentSource = this.enableFeature(fragmentSource, 'ADVANCED_LIGHTING');
    }
    
    return Shader.create(`PlatformShader_${platform}`, vertexSource, fragmentSource);
  }
  
  private enableFeature(source: string, feature: string): string {
    return `#define ${feature}\n${source}`;
  }
  
  private disableFeature(source: string, feature: string): string {
    return source.replace(new RegExp(`#define ${feature}`, 'g'), '');
  }
}
```

### Batch-Friendly Shaders

```glsl
// Vertex shader optimized for batching
attribute vec3 POSITION;
attribute vec2 TEXCOORD_0;
attribute vec4 COLOR_0;

// Instance data for batching
attribute vec4 a_instanceData; // x: scale, y: rotation, z: offsetX, w: offsetY

uniform mat4 camera_ViewProjMat; // Combined view-projection matrix

varying vec2 v_uv;
varying vec4 v_color;

void main() {
  // Apply instance transformations
  float scale = a_instanceData.x;
  float rotation = a_instanceData.y;
  vec2 offset = a_instanceData.zw;
  
  // Rotate and scale vertex
  float cos_r = cos(rotation);
  float sin_r = sin(rotation);
  
  vec2 rotatedPos = vec2(
    POSITION.x * cos_r - POSITION.y * sin_r,
    POSITION.x * sin_r + POSITION.y * cos_r
  ) * scale + offset;
  
  gl_Position = camera_ViewProjMat * vec4(rotatedPos, POSITION.z, 1.0);
  v_uv = TEXCOORD_0;
  v_color = COLOR_0;
}
```

## Shader Management and Organization

### Shader Registry

```ts
class ShaderRegistry {
  private static shaders = new Map<string, Shader>();
  
  static registerShader(name: string, shader: Shader): void {
    if (this.shaders.has(name)) {
      console.warn(`Shader ${name} already registered`);
      return;
    }
    this.shaders.set(name, shader);
  }
  
  static getShader(name: string): Shader | null {
    return this.shaders.get(name) || null;
  }
  
  static createMaterialWithShader(shaderName: string, engine: Engine): Material | null {
    const shader = this.getShader(shaderName);
    if (!shader) {
      console.error(`Shader ${shaderName} not found`);
      return null;
    }
    return new Material(engine, shader);
  }
  
  static precompileAllShaders(engine: Engine): void {
    for (const [name, shader] of this.shaders) {
      console.log(`Precompiling shader: ${name}`);
      shader.compileVariant(engine, []); // Compile basic variant
    }
  }
}

// Register built-in shaders
ShaderRegistry.registerShader("Unlit", unlitShader);
ShaderRegistry.registerShader("BlinnPhong", blinnPhongShader);
ShaderRegistry.registerShader("PBR", pbrShader);
```

### Shader Hot Reloading (Development)

```ts
class ShaderHotReloader {
  private watchedFiles = new Map<string, string>();
  
  watchShaderFile(filePath: string, shaderName: string): void {
    // In a real implementation, this would use file system watchers
    this.watchedFiles.set(filePath, shaderName);
    
    // Simulate file change detection
    this.checkForChanges(filePath, shaderName);
  }
  
  private async checkForChanges(filePath: string, shaderName: string): Promise<void> {
    // Load new shader source
    const newSource = await fetch(filePath).then(r => r.text());
    
    try {
      // Create new shader
      const newShader = Shader.create(newSource);
      
      // Replace existing shader
      const oldShader = Shader.find(shaderName);
      if (oldShader) {
        oldShader.destroy(true);
      }
      
      console.log(`Hot reloaded shader: ${shaderName}`);
    } catch (error) {
      console.error(`Failed to hot reload shader ${shaderName}:`, error);
    }
  }
}
```

## API Reference

```apidoc
Shader:
  Static Methods:
    create(shaderSource: string, platformTarget?: ShaderLanguage, path?: string): Shader
      - Create shader from ShaderLab source code. Requires ShaderLab integration.
    create(name: string, vertexSource: string, fragmentSource: string): Shader
      - Create simple shader with vertex and fragment source code.
    create(name: string, shaderPasses: ShaderPass[]): Shader
      - Create shader with multiple passes in default SubShader.
    create(name: string, subShaders: SubShader[]): Shader
      - Create shader with multiple SubShaders for different rendering contexts.
    find(name: string): Shader
      - Find existing shader by name. Returns null if not found.

  Properties:
    name: string
      - Unique name identifier for the shader.
    subShaders: ReadonlyArray<SubShader>
      - Collection of SubShaders containing rendering passes.
    destroyed: boolean
      - Whether the shader has been destroyed and resources released.

  Methods:
    compileVariant(engine: Engine, macros: string[]): boolean
      - Compile shader variant with specific macro definitions. Returns compilation success.
    destroy(force?: boolean): boolean
      - Destroy shader and release resources. Force bypasses reference counting.

SubShader:
  Properties:
    name: string
      - Name of the SubShader for identification.
    passes: ReadonlyArray<ShaderPass>
      - Collection of rendering passes in this SubShader.
    tags: Record<string, string>
      - Tags for SubShader selection (e.g., RenderPipeline, Queue, LightMode).

ShaderPass:
  Properties:
    name: string
      - Name of the shader pass.
    tags: Record<string, string>
      - Tags for pass-specific configuration.

  Internal Properties:
    _vertexSource: string
      - Vertex shader source code.
    _fragmentSource: string
      - Fragment shader source code.
    _renderState: RenderState
      - Render state overrides for this pass.

ShaderMacro:
  Static Methods:
    getByName(name: string): ShaderMacro
      - Get shader macro by name. Creates if doesn't exist.
    getByName(name: string, value: string): ShaderMacro
      - Get shader macro with specific value.

  Properties:
    name: string
      - Macro name for conditional compilation.
    value: string
      - Optional macro value for parameterized macros.

ShaderProperty:
  Static Methods:
    getByName(name: string): ShaderProperty
      - Get shader property by name. Creates if doesn't exist.

  Properties:
    name: string
      - Property name as used in shader code.
    type: ShaderPropertyType
      - Data type of the property (Float, Vector3, Texture, etc.).

ShaderPropertyType:
  Enum Values:
    Float: Scalar floating-point value
    Int: Integer value
    Vector2: 2D vector
    Vector3: 3D vector  
    Vector4: 4D vector
    Color: RGBA color (Vector4)
    Matrix: 4x4 transformation matrix
    Texture: 2D texture sampler
    TextureArray: Array of textures
    FloatArray: Array of floats
    IntArray: Array of integers
```

## Best Practices

- **Use Shader Macros**: Enable/disable features through macros rather than multiple shader files
- **Precompile Variants**: Compile common shader variants at startup to avoid runtime hitches
- **Optimize for Target Platform**: Use appropriate precision and feature sets for mobile vs desktop
- **Share Shader Instances**: Use the same shader across multiple materials when possible
- **Profile Shader Complexity**: Monitor vertex and fragment shader instruction counts
- **Use Built-in Properties**: Leverage engine-provided uniforms rather than custom ones
- **Implement LOD Systems**: Use simpler shaders at distance to improve performance
- **Cache Shader Programs**: Let the engine handle shader program caching and reuse

## Common Issues

**Shader Compilation Errors**: Check shader source syntax and macro definitions:
```ts
const isValid = shader.compileVariant(engine, ["PROBLEMATIC_MACRO"]);
if (!isValid) {
  console.error("Shader compilation failed - check macro definitions and syntax");
}
```

**Missing Shader Properties**: Ensure property names match between shader and material:
```glsl
// In shader
uniform vec4 material_BaseColor;

// In code - names must match exactly
material.shaderData.setColor("material_BaseColor", color);
```

**Platform Compatibility**: Use appropriate GLSL ES versions:
```glsl
// For WebGL 1.0 (older devices)
precision mediump float;

// For WebGL 2.0 (modern devices)  
#version 300 es
precision mediump float;
```

**Macro Conflicts**: Be careful with macro enabling/disabling:
```ts
// Clear conflicting macros
shaderData.disableMacro("OLD_FEATURE");
shaderData.enableMacro("NEW_FEATURE");
```

**Memory Leaks**: Track shader ownership and destroy when no materials reference it:
```ts
// Track shaders you create manually
const shader = Shader.create("Custom", vsSource, fsSource);
const managedShaders = new Set<Shader>();
managedShaders.add(shader);

// Later, when all materials using the shader are disposed
shader.destroy();
managedShaders.delete(shader);
```
