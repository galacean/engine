# Shader Library

Galacean Engine provides a comprehensive shader library with built-in fragments, utility functions, and specialized shaders for various rendering techniques. This library enables efficient shader development through reusable components and standardized implementations.

## Core Shader Fragments

### Common Utilities

The `common.glsl` fragment provides essential constants, utility functions, and color space conversions:

```glsl
#include <common>

// Mathematical constants
#define PI 3.14159265359
#define RECIPROCAL_PI 0.31830988618
#define EPSILON 1e-6
#define HALF_MIN 6.103515625e-5
#define HALF_EPS 4.8828125e-4

// Utility functions
float pow2(float x) { return x * x; }
float saturate(float a) { return clamp(a, 0.0, 1.0); }

// Color space conversions
vec4 sRGBToLinear(vec4 value);
vec4 linearToSRGB(vec4 value);
vec4 gammaToLinear(vec4 value);
vec4 linearToGamma(vec4 value);

// Texture sampling with sRGB correction
vec4 texture2DSRGB(sampler2D tex, vec2 uv);
vec4 outputSRGBCorrection(vec4 linearIn);

// Depth buffer utilities
float remapDepthBufferLinear01(float depth);
float remapDepthBufferEyeDepth(float depth);

// Noise function
float interleavedGradientNoise(vec2 sampleCoord);
```

### Transform System

Transform-related shader fragments handle vertex transformations and coordinate spaces:

```glsl
#include <transform_declare>
#include <camera_declare>

// Transform matrices
uniform mat4 renderer_MVMat;        // Model-View matrix
uniform mat4 renderer_MVPMat;       // Model-View-Projection matrix
uniform mat4 renderer_NormalMat;    // Normal transformation matrix

// Camera parameters
uniform vec3 camera_Position;       // World space camera position
uniform mat4 camera_ViewMat;        // View matrix
uniform mat4 camera_ProjMat;        // Projection matrix

// Usage in vertex shaders
#include <begin_position_vert>
#include <skinning_vert>
#include <position_vert>
```

### Lighting System

The lighting fragment provides structures and functions for various light types:

```glsl
#include <Light>

// Light structures
struct DirectLight {
    vec3 color;
    vec3 direction;
};

struct PointLight {
    vec3 color;
    vec3 position;
    float distance;
};

struct SpotLight {
    vec3 color;
    vec3 position;
    vec3 direction;
    float distance;
    float angleCos;
    float penumbraCos;
};

struct EnvMapLight {
    vec3 diffuse;
    float mipMapLevel;
    float diffuseIntensity;
    float specularIntensity;
};

// Light arrays (WebGL2)
#ifdef GRAPHICS_API_WEBGL2
DirectLight getDirectLight(int index);
PointLight getPointLight(int index);
SpotLight getSpotLight(int index);
#endif

// Environment lighting
#ifdef SCENE_USE_SH
vec3 scene_EnvSH[9];  // Spherical harmonics coefficients
#endif

#ifdef SCENE_USE_SPECULAR_ENV
samplerCube scene_EnvSpecularSampler;
#endif
```

### Shadow System

Shadow mapping utilities with cascade support:

```glsl
#include <Shadow>

#ifdef NEED_CALCULATE_SHADOWS
// Shadow matrices for cascaded shadow maps
mat4 scene_ShadowMatrices[SCENE_SHADOW_CASCADED_COUNT + 1];
vec4 scene_ShadowSplitSpheres[4];

// Cascade selection
mediump int computeCascadeIndex(vec3 positionWS);

// Shadow sampling functions
float sampleShadowMap(vec3 shadowCoord);
float sampleShadowMapFiltered4(vec3 shadowCoord, vec4 shadowmapSize);
float sampleShadowMapFiltered9(vec3 shadowCoord, vec4 shadowmapSize);

// Shadow coordinate calculation
vec3 getShadowCoord(vec3 worldPos, int cascadeIndex);
float calculateShadow(vec3 worldPos);
#endif
```

## Noise Function Library

Galacean provides extensive noise functions for procedural generation:

### Perlin Noise

```glsl
#include <noise_perlin>

// 2D Perlin noise
float perlin(vec2 P);
float perlin(vec2 P, vec2 rep);  // Periodic variant

// 3D Perlin noise
float perlin(vec3 P);
float perlin(vec3 P, vec3 rep);  // Periodic variant

// 4D Perlin noise
float perlin(vec4 P);
float perlin(vec4 P, vec4 rep);  // Periodic variant

// Usage example
float noiseValue = perlin(worldPos.xz * 0.1);
float terrainHeight = noiseValue * 10.0;
```

### Simplex Noise

```glsl
#include <noise_simplex>

// 2D Simplex noise
float simplex(vec2 v);

// 3D Simplex noise
float simplex(vec3 v);
float simplex(vec3 v, out vec3 gradient);  // With gradient output

// 4D Simplex noise
float simplex(vec4 v);

// Advanced 2D simplex with rotation and tiling
float psrnoise(vec2 pos, vec2 per, float rot);  // Periodic with rotation
float psnoise(vec2 pos, vec2 per);              // Periodic
float srnoise(vec2 pos, float rot);             // Non-tiling with rotation
float snoise(vec2 pos);                         // Basic simplex

// Usage example
vec3 gradient;
float noise = simplex(worldPos * 0.05, gradient);
vec3 perturbedNormal = normalize(normal + gradient * 0.1);
```

### Cellular Noise

```glsl
#include <noise_cellular>

// 2D Cellular noise
vec2 cellular(vec2 P);      // Returns F1 and F2 distances
vec3 cellular2x2(vec2 P);   // 2x2 grid optimization
vec4 cellular2x2x2(vec3 P); // 3D variant

// 3D Cellular noise
vec2 cellular(vec3 P);

// Usage for Voronoi patterns
vec2 cellNoise = cellular(worldPos.xz * 0.1);
float voronoi = cellNoise.x;                    // F1 distance
float voronoiEdges = cellNoise.y - cellNoise.x; // F2 - F1 for edges
```

### Random Number Generation

```glsl
#include <noise_common>

// Utility functions for noise generation
vec4 mod289(vec4 x);    // Modulo 289 without division
vec3 mod289(vec3 x);
vec2 mod289(vec2 x);
float mod289(float x);

vec4 permute(vec4 x);   // Permutation polynomial
vec3 permute(vec3 x);
float permute(float x);

vec4 taylorInvSqrt(vec4 r);  // Fast inverse square root
float taylorInvSqrt(float r);

vec4 fade(vec4 t);      // Smoothstep interpolation
vec3 fade(vec3 t);
vec2 fade(vec2 t);

// Random number generation
float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

vec2 random2(vec2 st) {
    st = vec2(dot(st, vec2(127.1, 311.7)), dot(st, vec2(269.5, 183.3)));
    return -1.0 + 2.0 * fract(sin(st) * 43758.5453123);
}
```

## PBR Shader Library

### BRDF Functions

```glsl
#include <brdf>

// Fresnel functions
float F_Schlick(float f0, float dotLH);
vec3 F_Schlick(vec3 specularColor, float dotLH);

// Geometry functions
float G_GGX_SmithCorrelated(float alpha, float dotNL, float dotNV);

// Distribution functions
float D_GGX(float alpha, float dotNH);
float D_GGX_Anisotropic(float at, float ab, float ToH, float BoH, float NoH);

// Combined BRDF functions
float DG_GGX(float alpha, float dotNV, float dotNL, float dotNH);
vec3 BRDF_Specular_GGX(vec3 incidentDirection, Geometry geometry, 
                       Material material, vec3 normal, vec3 specularColor, float roughness);
vec3 BRDF_Diffuse_Lambert(vec3 diffuseColor);

// Iridescence support
vec3 evalIridescence(float outsideIOR, float eta2, float cosTheta1, 
                     float thinFilmThickness, vec3 baseF0);
```

### IBL (Image-Based Lighting)

```glsl
#include <ibl_frag_define>

// Spherical harmonics diffuse lighting
vec3 getLightProbeIrradiance(vec3 sh[9], vec3 normal);

// Specular environment mapping
vec3 getLightProbeRadiance(Geometry geometry, vec3 normal, float roughness, 
                          int maxMIPLevel, float specularIntensity);

// Environment BRDF approximation
vec3 envBRDFApprox(vec3 specularColor, float roughness, float dotNV);

// Specular MIP level calculation
float getSpecularMIPLevel(float roughness, int maxMIPLevel);

// Reflection vector calculation
vec3 getReflectedVector(Geometry geometry, vec3 n);

// Sheen IBL evaluation
void evaluateSheenIBL(Geometry geometry, Material material, float radianceAttenuation,
                      inout vec3 diffuseColor, inout vec3 specularColor);
```

### Material System

```glsl
#include <pbr_frag_define>

// Material structure
struct Material {
    vec3 diffuseColor;
    float roughness;
    vec3 specularColor;
    float opacity;
    float f0;
    float diffuseAO;
    float specularAO;
    vec3 envSpecularDFG;
    float IOR;
    
    #ifdef MATERIAL_ENABLE_CLEAR_COAT
    float clearCoat;
    float clearCoatRoughness;
    #endif
    
    #ifdef MATERIAL_ENABLE_TRANSMISSION
    float transmission;
    float thickness;
    vec3 attenuationColor;
    float attenuationDistance;
    #endif
};

// Geometry structure
struct Geometry {
    vec3 position;
    vec3 normal;
    vec3 viewDir;
    float dotNV;
    
    #ifdef MATERIAL_ENABLE_ANISOTROPY
    vec3 anisotropicT;
    vec3 anisotropicB;
    vec3 anisotropicN;
    float anisotropy;
    #endif
};

// Reflected light accumulation
struct ReflectedLight {
    vec3 directDiffuse;
    vec3 directSpecular;
    vec3 indirectDiffuse;
    vec3 indirectSpecular;
};

// Material initialization
void initMaterial(out Material material, inout Geometry geometry);
void initGeometry(out Geometry geometry, bool frontFacing);
```

## Built-in Shader Templates

### Unlit Shader

```glsl
// Vertex shader
#include <common_vert>
#include <transform_declare>
#include <uv_share>

void main() {
    #include <begin_position_vert>
    #include <position_vert>
    #include <uv_vert>
}

// Fragment shader
#include <common>
#include <uv_share>

uniform vec4 material_BaseColor;
uniform float material_AlphaCutoff;

#ifdef MATERIAL_HAS_BASETEXTURE
uniform sampler2D material_BaseTexture;
#endif

void main() {
    vec4 baseColor = material_BaseColor;
    
    #ifdef MATERIAL_HAS_BASETEXTURE
    baseColor *= texture2DSRGB(material_BaseTexture, v_uv);
    #endif
    
    #ifdef MATERIAL_IS_ALPHA_CUTOFF
    if(baseColor.a < material_AlphaCutoff) {
        discard;
    }
    #endif
    
    gl_FragColor = baseColor;
    
    #ifndef MATERIAL_IS_TRANSPARENT
    gl_FragColor.a = 1.0;
    #endif
}
```

### Blinn-Phong Shader

```glsl
// Fragment shader
#include <common>
#include <camera_declare>
#include <uv_share>
#include <normal_share>
#include <color_share>
#include <worldpos_share>
#include <light_frag_define>
#include <mobile_material_frag>

void main() {
    #include <begin_mobile_frag>
    #include <begin_viewdir_frag>
    #include <mobile_blinnphong_frag>
    
    gl_FragColor = emission + ambient + diffuse + specular;
    
    #ifdef MATERIAL_IS_TRANSPARENT
    gl_FragColor.a = diffuse.a;
    #else
    gl_FragColor.a = 1.0;
    #endif
}
```

This shader library provides the foundation for all rendering in Galacean Engine, enabling developers to create custom shaders while leveraging proven, optimized implementations of common rendering techniques.
