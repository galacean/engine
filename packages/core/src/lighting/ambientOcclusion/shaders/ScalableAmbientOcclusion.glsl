// Ambient Occlusion, largely inspired from:
// "The Alchemy Screen-Space Ambient Obscurance Algorithm" by Morgan McGuire
// "Scalable Ambient Obscurance" by Morgan McGuire, Michael Mara and David Luebke
// https://research.nvidia.com/sites/default/files/pubs/2012-06_Scalable-Ambient-Obscurance/McGuire12SAO.pdf

#include <common>

varying vec2 v_uv;
uniform vec4 renderer_texelSize;    // x: 1/width, y: 1/height, z: width, w: height
uniform highp sampler2D renderer_BlitTexture; // Camera_DepthTexture

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

uniform float material_invRadiusSquared; // Inverse of the squared radius
uniform float material_minHorizonAngleSineSquared; // Minimum horizon angle sine squared
uniform float material_intensity; // Intensity of the ambient occlusion
uniform float material_projectionScaleRadius;
uniform float material_bias; // Bias to avoid self-occlusion
uniform float material_peak2; // Peak value to avoid singularities
uniform float material_power; // Exponent to convert occlusion to visibility
uniform vec2 material_invProjScaleXY; //invProjection[0][0] * 2, invProjection[1][1] * 2


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

// reconstructing normal from depth buffer
// https://atyuwen.github.io/posts/normal-reconstruction
// https://wickedengine.net/2019/09/22/improved-normal-reconstruction-from-depth/
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
        H.x = texture2D(depthTexture, uv - dx).r;       // left
        H.y = texture2D(depthTexture, uv + dx).r;       // right
        H.z = texture2D(depthTexture, uv - dx * 2.0).r; // left2
        H.w = texture2D(depthTexture, uv + dx * 2.0).r; // right2
        
        // Calculate horizontal edge weights
        vec2 horizontalEdgeWeights = abs((2.0 * H.xy - H.zw) - depth);

        vec3 pos_l = computeViewSpacePosition(uv - dx, depthToViewZ(H.x), invProjScaleXY);
        vec3 pos_r = computeViewSpacePosition(uv + dx, depthToViewZ(H.y), invProjScaleXY);
        vec3 dpdx = (horizontalEdgeWeights.x < horizontalEdgeWeights.y) ? (viewPos - pos_l) : (pos_r - viewPos);

        // Sample depths for vertical edge detection
        vec4 V;
        V.x = texture2D(depthTexture, uv - dy).r;       // down
        V.y = texture2D(depthTexture, uv + dy).r;       // up
        V.z = texture2D(depthTexture, uv - dy * 2.0).r; // down2
        V.w = texture2D(depthTexture, uv + dy * 2.0).r; // up2

        // Calculate vertical edge weights
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

    float ssRadius = max(1.0, tap.z * ssDiskRadius); // at least 1 pixel screen-space radius

    vec2 uvSamplePos = uv + vec2(ssRadius * tap.xy) * renderer_texelSize.xy;

    float occlusionDepth = texture2D(renderer_BlitTexture, uvSamplePos).r;
    float linearOcclusionDepth = depthToViewZ(occlusionDepth);
    // “p” is the position after spiral sampling
    vec3 p = computeViewSpacePosition(uvSamplePos, linearOcclusionDepth, material_invProjScaleXY);

    // now we have the sample, compute AO
    vec3 v = p - originPosition;  // sample vector
    float vv = dot(v, v);       // squared distance
    float vn = dot(v, normal);  // distance * cos(v, normal)

    // discard samples that are outside of the radius, preventing distant geometry to
    // cast shadows -- there are many functions that work and choosing one is an artistic
    // decision.
    float weight = pow(max(0.0, 1.0 - vv * material_invRadiusSquared), 2.0);

    // discard samples that are too close to the horizon to reduce shadows cast by geometry
    // not sufficently tessellated. The goal is to discard samples that form an angle 'beta'
    // smaller than 'epsilon' with the horizon. We already have dot(v,n) which is equal to the
    // sin(beta) * |v|. So the test simplifies to vn^2 < vv * sin(epsilon)^2.
    weight *= step(vv * material_minHorizonAngleSineSquared, vn * vn);

    // Calculate the contribution of a single sampling point to Ambient Occlusion
    float sampleOcclusion = max(0.0, vn + (originPosition.z * material_bias)) / (vv + material_peak2);
    occlusion += weight * sampleOcclusion;
}

void scalableAmbientObscurance(vec2 uv, vec3 origin, vec3 normal, out float obscurance) {
    float noise = interleavedGradientNoise(gl_FragCoord.xy);
    vec2 tapPosition = startPosition(noise);
    mat2 angleStep = tapAngleStep();

    // Choose the screen-space sample radius
    // proportional to the projected area of the sphere
    float ssDiskRadius = -(material_projectionScaleRadius / origin.z);

    // Accumulate the occlusion amount of all sampling points
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


void main(){
    float depth = texture2D(renderer_BlitTexture, v_uv).r;
    float z = depthToViewZ(depth);

    // Reconstruct view space position from depth
    vec3 positionVS = computeViewSpacePosition(v_uv, z, material_invProjScaleXY);

    // Compute normal
    vec3 normal = computeViewSpaceNormal(v_uv, renderer_BlitTexture, depth, positionVS, renderer_texelSize.xy, material_invProjScaleXY);

    float occlusion = 0.0;
    scalableAmbientObscurance(v_uv, positionVS, normal, occlusion);

    // Occlusion to visibility
    float aoVisibility = pow(clamp(1.0 - occlusion, 0.0, 1.0), material_power);

    gl_FragColor = vec4(aoVisibility, pack(-positionVS.z/camera_ProjectionParams.z), 1.0);
}

