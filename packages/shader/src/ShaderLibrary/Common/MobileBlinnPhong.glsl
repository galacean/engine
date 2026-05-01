#ifndef MOBILE_BLINNPHONG_INCLUDED
#define MOBILE_BLINNPHONG_INCLUDED

#include "ShaderLibrary/Common/Common.glsl"
#include "ShaderLibrary/Common/Light.glsl"
#include "ShaderLibrary/Common/Normal.glsl"

// Material uniforms
vec4 material_EmissiveColor;
vec4 material_BaseColor;
vec4 material_SpecularColor;
float material_Shininess;
float material_NormalIntensity;
float material_AlphaCutoff;

#ifdef MATERIAL_HAS_EMISSIVETEXTURE
    sampler2D material_EmissiveTexture;
#endif

#ifdef MATERIAL_HAS_BASETEXTURE
    sampler2D material_BaseTexture;
#endif

#ifdef MATERIAL_HAS_SPECULAR_TEXTURE
    sampler2D material_SpecularTexture;
#endif

#ifdef MATERIAL_HAS_NORMALTEXTURE
    sampler2D material_NormalTexture;
#endif

// Initialize material colors from textures
// Note: vertex color should be applied by the caller after this function
void initBlinnPhongMaterial(vec2 uv, out vec4 ambient, out vec4 emission, out vec4 diffuse, out vec4 specular) {
    ambient = vec4(0.0);
    emission = material_EmissiveColor;
    diffuse = material_BaseColor;
    specular = material_SpecularColor;

    #ifdef MATERIAL_HAS_EMISSIVETEXTURE
        emission *= texture2DSRGB(material_EmissiveTexture, uv);
    #endif

    #ifdef MATERIAL_HAS_BASETEXTURE
        diffuse *= texture2DSRGB(material_BaseTexture, uv);
    #endif

    #ifdef MATERIAL_HAS_SPECULAR_TEXTURE
        specular *= texture2DSRGB(material_SpecularTexture, uv);
    #endif

    ambient = vec4(scene_EnvMapLight.diffuse * scene_EnvMapLight.diffuseIntensity, 1.0) * diffuse;
}

// Calculate Blinn-Phong lighting
// shadowAttenuation: pre-computed shadow factor (1.0 = no shadow)
void calculateBlinnPhongLighting(
    vec3 N, vec3 V, vec3 worldPos,
    float shadowAttenuation,
    inout vec4 diffuse, inout vec4 specular
) {
    vec3 lightDiffuse = vec3(0.0);
    vec3 lightSpecular = vec3(0.0);

    #ifdef SCENE_DIRECT_LIGHT_COUNT
        DirectLight directionalLight;
        for (int i = 0; i < SCENE_DIRECT_LIGHT_COUNT; i++) {
            if (!isRendererCulledByLight(renderer_Layer.xy, scene_DirectLightCullingMask[i])) {
                directionalLight.color = scene_DirectLightColor[i];
                #ifdef NEED_CALCULATE_SHADOWS
                    if (i == 0) {
                        directionalLight.color *= shadowAttenuation;
                    }
                #endif
                directionalLight.direction = scene_DirectLightDirection[i];

                float d = max(dot(N, -directionalLight.direction), 0.0);
                lightDiffuse += directionalLight.color * d;

                vec3 halfDir = normalize(V - directionalLight.direction);
                float s = pow(clamp(dot(N, halfDir), 0.0, 1.0), material_Shininess);
                lightSpecular += directionalLight.color * s;
            }
        }
    #endif

    #ifdef SCENE_POINT_LIGHT_COUNT
        PointLight pointLight;
        for (int i = 0; i < SCENE_POINT_LIGHT_COUNT; i++) {
            if (!isRendererCulledByLight(renderer_Layer.xy, scene_PointLightCullingMask[i])) {
                pointLight.color = scene_PointLightColor[i];
                pointLight.position = scene_PointLightPosition[i];
                pointLight.distance = scene_PointLightDistance[i];

                vec3 direction = worldPos - pointLight.position;
                float dist = length(direction);
                direction /= dist;
                float decay = clamp(1.0 - pow(dist / pointLight.distance, 4.0), 0.0, 1.0);

                float d = max(dot(N, -direction), 0.0) * decay;
                lightDiffuse += pointLight.color * d;

                vec3 halfDir = normalize(V - direction);
                float s = pow(clamp(dot(N, halfDir), 0.0, 1.0), material_Shininess) * decay;
                lightSpecular += pointLight.color * s;
            }
        }
    #endif

    #ifdef SCENE_SPOT_LIGHT_COUNT
        SpotLight spotLight;
        for (int i = 0; i < SCENE_SPOT_LIGHT_COUNT; i++) {
            if (!isRendererCulledByLight(renderer_Layer.xy, scene_SpotLightCullingMask[i])) {
                spotLight.color = scene_SpotLightColor[i];
                spotLight.position = scene_SpotLightPosition[i];
                spotLight.direction = scene_SpotLightDirection[i];
                spotLight.distance = scene_SpotLightDistance[i];
                spotLight.angleCos = scene_SpotLightAngleCos[i];
                spotLight.penumbraCos = scene_SpotLightPenumbraCos[i];

                vec3 direction = spotLight.position - worldPos;
                float lightDistance = length(direction);
                direction /= lightDistance;
                float angleCos = dot(direction, -spotLight.direction);
                float decay = clamp(1.0 - pow(lightDistance / spotLight.distance, 4.0), 0.0, 1.0);
                float spotEffect = smoothstep(spotLight.penumbraCos, spotLight.angleCos, angleCos);
                float decayTotal = decay * spotEffect;
                float d = max(dot(N, direction), 0.0) * decayTotal;
                lightDiffuse += spotLight.color * d;

                vec3 halfDir = normalize(V + direction);
                float s = pow(clamp(dot(N, halfDir), 0.0, 1.0), material_Shininess) * decayTotal;
                lightSpecular += spotLight.color * s;
            }
        }
    #endif

    diffuse *= vec4(lightDiffuse, 1.0);
    specular *= vec4(lightSpecular, 1.0);
}

#endif
