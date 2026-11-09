#ifndef PARTICLE_VERT_INCLUDED
#define PARTICLE_VERT_INCLUDED

// Particle forward pass library: provides `Attributes`, `Varyings`, all engine
// uniforms, and the reusable helpers below. The `vert` / `frag` entry points
// live in the consuming `.shader` so they can be edited directly without
// digging into this include.
//
//   vec3 computeParticleCenter(Attributes attr, float age, float normalizedAge, inout Varyings v);
//   vec2 computeParticleVaryingUV(Attributes attr, float normalizedAge);   // requires MATERIAL_HAS_BASETEXTURE
//   vec4 computeParticleColor(Attributes attr, vec4 startColor, float normalizedAge);

#include "ShaderLibrary/Common/Common.glsl"

// Uniforms
float renderer_CurrentTime;
vec3 renderer_Gravity;
vec3 renderer_WorldPosition;
vec4 renderer_WorldRotation;
bool renderer_ThreeDStartRotation;
int renderer_ScalingMode;
vec3 renderer_PositionScale;
vec3 renderer_SizeScale;
vec3 renderer_PivotOffset;

mat4 camera_ViewMat;
mat4 camera_ProjMat;

#ifdef RENDERER_MODE_STRETCHED_BILLBOARD
    vec3 camera_Position;
#endif
vec3 camera_Forward;
vec3 camera_Up;

float renderer_StretchedBillboardLengthScale;
float renderer_StretchedBillboardSpeedScale;
int renderer_SimulationSpace;

vec4 material_BaseColor;
mediump vec3 material_EmissiveColor;

#ifdef MATERIAL_HAS_BASETEXTURE
    sampler2D material_BaseTexture;
#endif
#ifdef MATERIAL_HAS_EMISSIVETEXTURE
    sampler2D material_EmissiveTexture;
#endif

struct Attributes {
    #if defined(RENDERER_MODE_SPHERE_BILLBOARD) || defined(RENDERER_MODE_STRETCHED_BILLBOARD) || defined(RENDERER_MODE_HORIZONTAL_BILLBOARD) || defined(RENDERER_MODE_VERTICAL_BILLBOARD)
        vec4 a_CornerTextureCoordinate;
    #elif defined(RENDERER_MODE_MESH)
        vec3 POSITION;
        #ifdef RENDERER_ENABLE_VERTEXCOLOR
            vec4 COLOR_0;
        #endif
        vec2 TEXCOORD_0;
    #endif

    vec4 a_ShapePositionStartLifeTime;
    vec4 a_DirectionTime;
    vec4 a_StartColor;
    vec3 a_StartSize;
    vec3 a_StartRotation0;
    float a_StartSpeed;
    vec4 a_Random0;

    #if defined(RENDERER_TSA_FRAME_RANDOM_CURVES) || defined(RENDERER_VOL_IS_RANDOM_TWO) || defined(RENDERER_VOL_ORBITAL_IS_RANDOM_TWO) || defined(RENDERER_VOL_RADIAL_IS_RANDOM_TWO)
        vec4 a_Random1;
    #endif

    #if defined(RENDERER_FOL_CONSTANT_MODE) || defined(RENDERER_FOL_CURVE_MODE) || defined(RENDERER_LVL_MODULE_ENABLED)
        vec4 a_Random2;
    #endif

    vec3 a_SimulationWorldPosition;
    vec4 a_SimulationWorldRotation;

    #ifdef RENDERER_TRANSFORM_FEEDBACK
        vec3 a_FeedbackPosition;
        vec3 a_FeedbackVelocity;
    #endif

    #ifdef MATERIAL_HAS_BASETEXTURE
        vec4 a_SimulationUV;
    #endif
};

struct Varyings {
    vec4 v_Color;
    #ifdef MATERIAL_HAS_BASETEXTURE
        vec2 v_TextureCoordinate;
    #endif
    #if defined(RENDERER_MODE_MESH) && !defined(RENDERER_MODE_SPHERE_BILLBOARD) && !defined(RENDERER_MODE_STRETCHED_BILLBOARD) && !defined(RENDERER_MODE_HORIZONTAL_BILLBOARD) && !defined(RENDERER_MODE_VERTICAL_BILLBOARD)
        vec4 v_MeshColor;
    #endif
};

// Particle module includes (must be after Attributes/Varyings declarations)
#include "ShaderLibrary/Particle/ParticleCommon.glsl"
#include "ShaderLibrary/Particle/Module/VelocityOverLifetime.glsl"
#include "ShaderLibrary/Particle/Module/ForceOverLifetime.glsl"
#include "ShaderLibrary/Particle/Module/ColorOverLifetime.glsl"
#include "ShaderLibrary/Particle/Module/SizeOverLifetime.glsl"
#include "ShaderLibrary/Particle/Module/RotationOverLifetime.glsl"
#include "ShaderLibrary/Particle/Module/TextureSheetAnimation.glsl"
#include "ShaderLibrary/Particle/Module/LimitVelocityOverLifetime.glsl"

vec3 computeParticlePosition(Attributes attributes, in vec3 startVelocity, in float age, in float normalizedAge, vec3 gravityVelocity, vec4 worldRotation, inout vec3 localVelocity, inout vec3 worldVelocity) {
    vec3 startPosition = startVelocity * age;
    vec3 finalPosition;
    vec3 localPositionOffset = startPosition;
    vec3 worldPositionOffset;

    #ifdef _VOL_LINEAR_MODULE_ENABLED
        vec3 lifeVelocity;
        vec3 velocityPositionOffset = computeVelocityPositionOffset(attributes, normalizedAge, age, lifeVelocity);
        if (renderer_VOLSpace == 0) {
            localVelocity += lifeVelocity;
            localPositionOffset += velocityPositionOffset;
        } else {
            worldVelocity += lifeVelocity;
            worldPositionOffset += velocityPositionOffset;
        }
    #endif

    #ifdef _FOL_MODULE_ENABLED
        vec3 forceVelocity;
        vec3 forcePositionOffset = computeForcePositionOffset(attributes, normalizedAge, age, forceVelocity);
        if (renderer_FOLSpace == 0) {
            localVelocity += forceVelocity;
            localPositionOffset += forcePositionOffset;
        } else {
            worldVelocity += forceVelocity;
            worldPositionOffset += forcePositionOffset;
        }
    #endif

    finalPosition = rotationByQuaternions(attributes.a_ShapePositionStartLifeTime.xyz + localPositionOffset, worldRotation) + worldPositionOffset;

    if (renderer_SimulationSpace == 0) {
        finalPosition = finalPosition + renderer_WorldPosition;
    } else if (renderer_SimulationSpace == 1) {
        finalPosition = finalPosition + attributes.a_SimulationWorldPosition;
    }

    finalPosition += 0.5 * gravityVelocity * age;

    return finalPosition;
}

// Returns the world-space center for the particle, applying simulation,
// billboard / mesh placement, and 3D rotation. Writes v.v_MeshColor when
// running in mesh mode with vertex color enabled.
vec3 computeParticleCenter(Attributes attr, float age, float normalizedAge, inout Varyings v) {
    vec4 worldRotation;
    if (renderer_SimulationSpace == 0) {
        worldRotation = renderer_WorldRotation;
    } else {
        worldRotation = attr.a_SimulationWorldRotation;
    }

    vec3 localVelocity;
    vec3 worldVelocity;

    #ifdef RENDERER_TRANSFORM_FEEDBACK
        vec3 center;
        if (renderer_SimulationSpace == 0) {
            center = rotationByQuaternions(attr.a_FeedbackPosition, worldRotation) + renderer_WorldPosition;
        } else if (renderer_SimulationSpace == 1) {
            center = attr.a_FeedbackPosition;
        }
        localVelocity = attr.a_FeedbackVelocity;
        worldVelocity = vec3(0.0);
        vec4 invWorldRotation = quaternionConjugate(worldRotation);
        vec3 currentLinearVelocity = vec3(0.0);

        #ifdef _VOL_LINEAR_MODULE_ENABLED
            vec3 instantVOLVelocity = evaluateVOLVelocity(attr, normalizedAge);
            if (renderer_VOLSpace == 0) {
                localVelocity += instantVOLVelocity;
                currentLinearVelocity = renderer_SimulationSpace == 0
                    ? instantVOLVelocity
                    : rotationByQuaternions(instantVOLVelocity, worldRotation);
            } else {
                worldVelocity += instantVOLVelocity;
                currentLinearVelocity = renderer_SimulationSpace == 0
                    ? rotationByQuaternions(instantVOLVelocity, invWorldRotation)
                    : instantVOLVelocity;
            }
        #endif

        vec3 visualLocalVelocity = localVelocity;
        vec3 visualWorldVelocity = worldVelocity;

        #ifdef RENDERER_MODE_STRETCHED_BILLBOARD
            #ifdef _VOL_ORBITAL_RADIAL_MODULE_ENABLED
                vec3 visualSimulationVelocity = renderer_SimulationSpace == 0
                    ? attr.a_FeedbackVelocity
                    : rotationByQuaternions(attr.a_FeedbackVelocity, worldRotation);
                visualSimulationVelocity += currentLinearVelocity;

                vec3 rel;
                if (renderer_SimulationSpace == 0) {
                    rel = attr.a_FeedbackPosition - renderer_VOLOffset;
                } else {
                    rel = rotationByQuaternions(
                        attr.a_FeedbackPosition - attr.a_SimulationWorldPosition,
                        invWorldRotation) - renderer_VOLOffset;
                }

                vec3 orbitalRadialVelocity = vec3(0.0);
                #if defined(RENDERER_VOL_RADIAL_CONSTANT_MODE) || defined(RENDERER_VOL_RADIAL_CURVE_MODE)
                    float relLen = length(rel);
                    if (relLen > 1e-5) {
                        orbitalRadialVelocity += (rel / relLen) * evaluateVOLRadial(attr, normalizedAge);
                    }
                #endif

                #if defined(RENDERER_VOL_ORBITAL_CONSTANT_MODE) || defined(RENDERER_VOL_ORBITAL_CURVE_MODE)
                    orbitalRadialVelocity += cross(evaluateVOLOrbital(attr, normalizedAge), rel);
                #endif

                if (renderer_SimulationSpace == 0) {
                    visualLocalVelocity = visualSimulationVelocity + orbitalRadialVelocity;
                    visualWorldVelocity = vec3(0.0);
                } else {
                    visualLocalVelocity = vec3(0.0);
                    visualWorldVelocity = visualSimulationVelocity + rotationByQuaternions(orbitalRadialVelocity, worldRotation);
                }
            #endif
        #endif
    #else
        vec3 startVelocity = attr.a_DirectionTime.xyz * attr.a_StartSpeed;
        vec3 gravityVelocity = renderer_Gravity * attr.a_Random0.x * age;
        localVelocity = startVelocity;
        worldVelocity = gravityVelocity;
        vec3 center = computeParticlePosition(attr, startVelocity, age, normalizedAge, gravityVelocity, worldRotation, localVelocity, worldVelocity);
        vec3 visualLocalVelocity = localVelocity;
        vec3 visualWorldVelocity = worldVelocity;
    #endif

    // Billboard / Mesh mode positioning
    #ifdef RENDERER_MODE_SPHERE_BILLBOARD
        vec2 corner = attr.a_CornerTextureCoordinate.xy + renderer_PivotOffset.xy;
        vec3 sideVector = normalize(cross(camera_Forward, camera_Up));
        vec3 upVector = normalize(cross(sideVector, camera_Forward));
        corner *= computeParticleSizeBillboard(attr, attr.a_StartSize.xy, normalizedAge);
        #if defined(RENDERER_ROL_CONSTANT_MODE) || defined(RENDERER_ROL_CURVE_MODE)
            if (renderer_ThreeDStartRotation) {
                vec3 rotation = radians(vec3(attr.a_StartRotation0.xy, computeParticleRotationFloat(attr, attr.a_StartRotation0.z, age, normalizedAge)));
                center += renderer_SizeScale.xzy * rotationByEuler(corner.x * sideVector + corner.y * upVector, rotation);
            } else {
                float rot = radians(computeParticleRotationFloat(attr, attr.a_StartRotation0.x, age, normalizedAge));
                float c = cos(rot);
                float s = sin(rot);
                mat2 rotation = mat2(c, -s, s, c);
                corner = rotation * corner;
                center += renderer_SizeScale.xzy * (corner.x * sideVector + corner.y * upVector);
            }
        #else
            if (renderer_ThreeDStartRotation) {
                center += renderer_SizeScale.xzy * rotationByEuler(corner.x * sideVector + corner.y * upVector, radians(attr.a_StartRotation0));
            } else {
                float c = cos(radians(attr.a_StartRotation0.x));
                float s = sin(radians(attr.a_StartRotation0.x));
                mat2 rotation = mat2(c, -s, s, c);
                corner = rotation * corner;
                center += renderer_SizeScale.xzy * (corner.x * sideVector + corner.y * upVector);
            }
        #endif
    #elif defined(RENDERER_MODE_STRETCHED_BILLBOARD)
        vec2 corner = attr.a_CornerTextureCoordinate.xy + renderer_PivotOffset.xy;
        vec3 velocity = rotationByQuaternions(renderer_SizeScale * visualLocalVelocity, worldRotation) + visualWorldVelocity;
        vec3 cameraUpVector = normalize(velocity);
        vec3 direction = normalize(center - camera_Position);
        vec3 sideVector = normalize(cross(direction, normalize(velocity)));

        sideVector = renderer_SizeScale.xzy * sideVector;
        cameraUpVector = length(vec3(renderer_SizeScale.x, 0.0, 0.0)) * cameraUpVector;

        vec2 size = computeParticleSizeBillboard(attr, attr.a_StartSize.xy, normalizedAge);

        const mat2 rotationZHalfPI = mat2(0.0, -1.0, 1.0, 0.0);
        corner = rotationZHalfPI * corner;
        corner.y = corner.y - abs(corner.y);

        float speed = length(velocity);
        center += sign(renderer_SizeScale.x) * (sign(renderer_StretchedBillboardLengthScale) * size.x * corner.x * sideVector
                + (speed * renderer_StretchedBillboardSpeedScale + size.y * renderer_StretchedBillboardLengthScale) * corner.y * cameraUpVector);
    #elif defined(RENDERER_MODE_HORIZONTAL_BILLBOARD)
        vec2 corner = attr.a_CornerTextureCoordinate.xy + renderer_PivotOffset.xy;
        const vec3 sideVector = vec3(1.0, 0.0, 0.0);
        const vec3 upVector = vec3(0.0, 0.0, -1.0);
        corner *= computeParticleSizeBillboard(attr, attr.a_StartSize.xy, normalizedAge);

        float rot;
        if (renderer_ThreeDStartRotation) {
            rot = radians(computeParticleRotationFloat(attr, attr.a_StartRotation0.z, age, normalizedAge));
        } else {
            rot = radians(computeParticleRotationFloat(attr, attr.a_StartRotation0.x, age, normalizedAge));
        }

        float c = cos(rot);
        float s = sin(rot);
        mat2 rotation = mat2(c, -s, s, c);
        corner = rotation * corner;
        center += renderer_SizeScale.xzy * (corner.x * sideVector + corner.y * upVector);
    #elif defined(RENDERER_MODE_VERTICAL_BILLBOARD)
        vec2 corner = attr.a_CornerTextureCoordinate.xy + renderer_PivotOffset.xy;
        const vec3 cameraUpVector = vec3(0.0, 1.0, 0.0);
        vec3 sideVector = normalize(cross(camera_Forward, cameraUpVector));

        float rot = radians(computeParticleRotationFloat(attr, attr.a_StartRotation0.x, age, normalizedAge));
        float c = cos(rot);
        float s = sin(rot);
        mat2 rotation = mat2(c, -s, s, c);
        corner = rotation * corner * cos(0.78539816339744830961566084581988);
        corner *= computeParticleSizeBillboard(attr, attr.a_StartSize.xy, normalizedAge);
        center += renderer_SizeScale.xzy * (corner.x * sideVector + corner.y * cameraUpVector);
    #elif defined(RENDERER_MODE_MESH)
        #if defined(RENDERER_ROL_CONSTANT_MODE) || defined(RENDERER_ROL_CURVE_MODE)
            #define RENDERER_ROL_ENABLED
        #endif

        vec3 size = computeParticleSizeMesh(attr, attr.a_StartSize, normalizedAge);

        bool is3DRotation = renderer_ThreeDStartRotation;
        #if defined(RENDERER_ROL_ENABLED) && defined(RENDERER_ROL_IS_SEPARATE)
            is3DRotation = true;
        #endif

        if (is3DRotation) {
            #ifdef RENDERER_ROL_ENABLED
                vec3 startRotation = renderer_ThreeDStartRotation ? attr.a_StartRotation0 : vec3(0.0, 0.0, attr.a_StartRotation0.x);
                vec3 rotation = radians(computeParticleRotationVec3(attr, startRotation, age, normalizedAge));
            #else
                vec3 rotation = radians(attr.a_StartRotation0);
            #endif
            center += rotationByQuaternions(renderer_SizeScale * rotationByEuler(attr.POSITION * size, rotation), worldRotation);
        } else {
            #ifdef RENDERER_ROL_ENABLED
                float angle = radians(computeParticleRotationFloat(attr, attr.a_StartRotation0.x, age, normalizedAge));
            #else
                float angle = radians(attr.a_StartRotation0.x);
            #endif
            #ifdef RENDERER_EMISSION_SHAPE
                vec3 axis = vec3(attr.a_ShapePositionStartLifeTime.xy, 0.0);
                if (renderer_SimulationSpace == 1) {
                    axis = rotationByQuaternions(axis, worldRotation);
                }
                vec3 crossResult = cross(axis, vec3(0.0, 0.0, -1.0));
                float crossLen = length(crossResult);
                vec3 rotateAxis = crossLen > 0.0001 ? crossResult / crossLen : vec3(0.0, 1.0, 0.0);
            #else
                vec3 rotateAxis = vec3(0.0, 0.0, -1.0);
            #endif
            center += rotationByQuaternions(renderer_SizeScale * rotationByAxis(attr.POSITION * size, rotateAxis, angle), worldRotation);
        }
        #ifdef RENDERER_ENABLE_VERTEXCOLOR
            v.v_MeshColor = attr.COLOR_0;
        #endif
    #endif

    return center;
}

#ifdef MATERIAL_HAS_BASETEXTURE
// Returns the texture-sheet animated UV for the particle, covering both
// billboard and mesh paths.
vec2 computeParticleVaryingUV(Attributes attr, float normalizedAge) {
    vec2 simulateUV;
    #if defined(RENDERER_MODE_SPHERE_BILLBOARD) || defined(RENDERER_MODE_STRETCHED_BILLBOARD) || defined(RENDERER_MODE_HORIZONTAL_BILLBOARD) || defined(RENDERER_MODE_VERTICAL_BILLBOARD)
        simulateUV = attr.a_CornerTextureCoordinate.zw * attr.a_SimulationUV.xy + attr.a_SimulationUV.zw;
    #elif defined(RENDERER_MODE_MESH)
        simulateUV = attr.a_SimulationUV.zw + attr.TEXCOORD_0 * attr.a_SimulationUV.xy;
    #endif
    return computeParticleUV(attr, simulateUV, normalizedAge);
}
#endif

#endif
