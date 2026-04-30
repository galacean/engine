#ifndef SCALABLE_AMBIENT_OCCLUSION_INCLUDED
#define SCALABLE_AMBIENT_OCCLUSION_INCLUDED

// Ambient Occlusion, largely inspired from:
// "The Alchemy Screen-Space Ambient Obscurance Algorithm" by Morgan McGuire
// "Scalable Ambient Obscurance" by Morgan McGuire, Michael Mara and David Luebke
// https://research.nvidia.com/sites/default/files/pubs/2012-06_Scalable-Ambient-Obscurance/McGuire12SAO.pdf

#include "Common/Common.glsl"

vec4 renderer_texelSize;    // x: 1/width, y: 1/height, z: width, w: height
highp sampler2D renderer_BlitTexture; // Camera_DepthTexture

// float inc = (1.0f / (SAMPLE_COUNT - 0.5f)) * SPIRAL_TURNS * 2.0 * PI
// const vec2 angleIncCosSin = vec2(cos(inc), sin(inc))
#if SSAO_QUALITY == 0
    #define SAMPLE_COUNT 7.0
    #define SPIRAL_TURNS 3.0
    const vec2 angleIncCosSin = vec2(-0.971148, 0.238227);
#elif SSAO_QUALITY == 1
    #define SAMPLE_COUNT 11.0
    #define SPIRAL_TURNS 6.0
    const vec2 angleIncCosSin = vec2(-0.896127, -0.443780);
#elif SSAO_QUALITY == 2
    #define SAMPLE_COUNT 16.0
    #define SPIRAL_TURNS 7.0
    const vec2 angleIncCosSin = vec2(-0.966846, 0.255311);
#endif

float material_invRadiusSquared;
float material_minHorizonAngleSineSquared;
float material_intensity;
float material_projectionScaleRadius;
float material_bias;
float material_peak2;
float material_power;
vec2 material_invProjScaleXY;


vec3 computeViewSpacePosition(vec2 uv, float linearDepth, vec2 invProjScaleXY) {
    #ifdef CAMERA_ORTHOGRAPHIC
        return vec3((vec2(0.5) - uv)  * invProjScaleXY , linearDepth);
    #else
        return vec3((vec2(0.5) - uv)  * invProjScaleXY * linearDepth, linearDepth);
    #endif
}

float depthToViewZ(float depth) {
    return -remapDepthBufferEyeDepth(depth);
}

vec3 computeViewSpaceNormal(vec2 uv, highp sampler2D depthTexture, float depth, vec3 viewPos, vec2 texel, vec2 invProjScaleXY) {
    vec3 normal = vec3(0.0);
#if SSAO_QUALITY == 0 || SSAO_QUALITY == 1
        vec2 uvdx = uv + vec2(texel.x, 0.0);
        vec2 uvdy = uv + vec2(0.0, texel.y);

        float depthX = texture2D(depthTexture, uvdx).r;
        float depthY = texture2D(depthTexture, uvdy).r;

        vec3 px = computeViewSpacePosition(uvdx, depthToViewZ(depthX), invProjScaleXY);
        vec3 py = computeViewSpacePosition(uvdy, depthToViewZ(depthY), invProjScaleXY);

        vec3 dpdx = px - viewPos;
        vec3 dpdy = py - viewPos;

        normal = normalize(cross(dpdx, dpdy));

#elif SSAO_QUALITY == 2
        vec2 dx = vec2(texel.x, 0.0);
        vec2 dy = vec2(0.0, texel.y);

        vec4 H;
        H.x = texture2D(depthTexture, uv - dx).r;
        H.y = texture2D(depthTexture, uv + dx).r;
        H.z = texture2D(depthTexture, uv - dx * 2.0).r;
        H.w = texture2D(depthTexture, uv + dx * 2.0).r;

        vec2 horizontalEdgeWeights = abs((2.0 * H.xy - H.zw) - depth);

        vec3 pos_l = computeViewSpacePosition(uv - dx, depthToViewZ(H.x), invProjScaleXY);
        vec3 pos_r = computeViewSpacePosition(uv + dx, depthToViewZ(H.y), invProjScaleXY);
        vec3 dpdx = (horizontalEdgeWeights.x < horizontalEdgeWeights.y) ? (viewPos - pos_l) : (pos_r - viewPos);

        vec4 V;
        V.x = texture2D(depthTexture, uv - dy).r;
        V.y = texture2D(depthTexture, uv + dy).r;
        V.z = texture2D(depthTexture, uv - dy * 2.0).r;
        V.w = texture2D(depthTexture, uv + dy * 2.0).r;

        vec2 verticalEdgeWeights = abs((2.0 * V.xy - V.zw) - depth);
        vec3 pos_d = computeViewSpacePosition(uv - dy, depthToViewZ(V.x), invProjScaleXY);
        vec3 pos_u = computeViewSpacePosition(uv + dy, depthToViewZ(V.y), invProjScaleXY);
        vec3 dpdy = (verticalEdgeWeights.x < verticalEdgeWeights.y) ? (viewPos - pos_d) : (pos_u - viewPos);
        normal = normalize(cross(dpdx, dpdy));
    #endif
    return normal;
}

vec3 tapLocation(float i, const float noise) {
    float offset = ((2.0 * PI) * 2.4) * noise;
    float angle = ((i / SAMPLE_COUNT) * SPIRAL_TURNS) * (2.0 * PI) + offset;
    float radius = (i + noise + 0.5) / SAMPLE_COUNT;
    return vec3(cos(angle), sin(angle), radius * radius);
}

vec2 startPosition(const float noise) {
    float angle = ((2.0 * PI) * 2.4) * noise;
    return vec2(cos(angle), sin(angle));
}

mat2 tapAngleStep() {
    vec2 t = angleIncCosSin;
    return mat2(t.x, t.y, -t.y, t.x);
}

vec3 tapLocationFast(float i, vec2 p, const float noise) {
    float radius = (i + noise + 0.5) / SAMPLE_COUNT;
    return vec3(p, radius * radius);
}

void computeAmbientOcclusionSAO(inout float occlusion, float i, float ssDiskRadius, vec2 uv, vec3 originPosition, vec3 normal,
        vec2 tapPosition, float noise) {

    vec3 tap = tapLocationFast(i, tapPosition, noise);
    float ssRadius = max(1.0, tap.z * ssDiskRadius);
    vec2 uvSamplePos = uv + vec2(ssRadius * tap.xy) * renderer_texelSize.xy;

    float occlusionDepth = texture2D(renderer_BlitTexture, uvSamplePos).r;
    float linearOcclusionDepth = depthToViewZ(occlusionDepth);
    vec3 p = computeViewSpacePosition(uvSamplePos, linearOcclusionDepth, material_invProjScaleXY);

    vec3 v = p - originPosition;
    float vv = dot(v, v);
    float vn = dot(v, normal);

    float weight = pow(max(0.0, 1.0 - vv * material_invRadiusSquared), 2.0);
    weight *= step(vv * material_minHorizonAngleSineSquared, vn * vn);

    float sampleOcclusion = max(0.0, vn + (originPosition.z * material_bias)) / (vv + material_peak2);
    occlusion += weight * sampleOcclusion;
}

void scalableAmbientObscurance(vec2 uv, vec3 origin, vec3 normal, out float obscurance) {
    float noise = interleavedGradientNoise(gl_FragCoord.xy);
    vec2 tapPosition = startPosition(noise);
    mat2 angleStep = tapAngleStep();

    float ssDiskRadius = -(material_projectionScaleRadius / origin.z);

    obscurance = 0.0;
    for (float i = 0.0; i < SAMPLE_COUNT; i += 1.0) {
        computeAmbientOcclusionSAO(obscurance, i, ssDiskRadius, uv, origin, normal, tapPosition, noise);
        tapPosition = angleStep * tapPosition;
    }
    obscurance = sqrt(obscurance * material_intensity);
}

vec2 pack(highp float normalizedDepth) {
    highp float z = clamp(normalizedDepth, 0.0, 1.0);
    highp float t = floor(256.0 * z);
    mediump float hi = t * (1.0 / 256.0);
    mediump float lo = (256.0 * z) - t;
    return vec2(hi, lo);
}


void frag(Varyings v) {
    float depth = texture2D(renderer_BlitTexture, v.v_uv).r;
    float z = depthToViewZ(depth);

    vec3 positionVS = computeViewSpacePosition(v.v_uv, z, material_invProjScaleXY);
    vec3 normal = computeViewSpaceNormal(v.v_uv, renderer_BlitTexture, depth, positionVS, renderer_texelSize.xy, material_invProjScaleXY);

    float occlusion = 0.0;
    scalableAmbientObscurance(v.v_uv, positionVS, normal, occlusion);

    float aoVisibility = pow(clamp(1.0 - occlusion, 0.0, 1.0), material_power);

    gl_FragColor = vec4(aoVisibility, pack(-positionVS.z/camera_ProjectionParams.z), 1.0);
}

#endif
