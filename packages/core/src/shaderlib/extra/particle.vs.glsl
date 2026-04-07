#if defined(RENDERER_MODE_SPHERE_BILLBOARD) || defined(RENDERER_MODE_STRETCHED_BILLBOARD) || defined(RENDERER_MODE_HORIZONTAL_BILLBOARD) || defined(RENDERER_MODE_VERTICAL_BILLBOARD)
    attribute vec4 a_CornerTextureCoordinate;
#endif

#ifdef RENDERER_MODE_MESH
    attribute vec3 POSITION;
    #ifdef RENDERER_ENABLE_VERTEXCOLOR
        attribute vec4 COLOR_0;
    #endif
    attribute vec2 TEXCOORD_0;
    varying vec4 v_MeshColor;
#endif

attribute vec4 a_ShapePositionStartLifeTime;
attribute vec4 a_DirectionTime;
attribute vec4 a_StartColor;
attribute vec3 a_StartSize;
attribute vec3 a_StartRotation0;
attribute float a_StartSpeed;

//#if defined(COLOR_OVER_LIFETIME) || defined(RENDERER_COL_RANDOM_GRADIENTS) || defined(RENDERER_SOL_RANDOM_CURVES) || defined(RENDERER_SOL_RANDOM_CURVES_SEPARATE) || defined(ROTATION_OVER_LIFE_TIME_RANDOM_CONSTANTS) || defined(ROTATION_OVER_LIFETIME_RANDOM_CURVES)
    attribute vec4 a_Random0;
//#endif

#if defined(RENDERER_TSA_FRAME_RANDOM_CURVES) || defined(RENDERER_VOL_IS_RANDOM_TWO)
    attribute vec4 a_Random1; // x:texture sheet animation random
#endif

#if defined(RENDERER_FOL_CONSTANT_MODE) || defined(RENDERER_FOL_CURVE_MODE) || defined(RENDERER_LVL_MODULE_ENABLED)
    attribute vec4 a_Random2;
#endif

attribute vec3 a_SimulationWorldPosition;
attribute vec4 a_SimulationWorldRotation;

#ifdef RENDERER_TRANSFORM_FEEDBACK
    attribute vec3 a_FeedbackPosition;
    attribute vec3 a_FeedbackVelocity;
#endif

varying vec4 v_Color;
#ifdef MATERIAL_HAS_BASETEXTURE
    attribute vec4 a_SimulationUV;
    varying vec2 v_TextureCoordinate;
#endif

uniform float renderer_CurrentTime;
uniform vec3 renderer_Gravity;
uniform vec3 renderer_WorldPosition;
uniform vec4 renderer_WorldRotation;
uniform bool renderer_ThreeDStartRotation;
uniform int renderer_ScalingMode;
uniform vec3 renderer_PositionScale;
uniform vec3 renderer_SizeScale;
uniform vec3 renderer_PivotOffset;

uniform mat4 camera_ViewMat;
uniform mat4 camera_ProjMat;

#ifdef RENDERER_MODE_STRETCHED_BILLBOARD
    uniform vec3 camera_Position;
#endif
uniform vec3 camera_Forward; // TODO:只有几种广告牌模式需要用
uniform vec3 camera_Up;

uniform float renderer_StretchedBillboardLengthScale;
uniform float renderer_StretchedBillboardSpeedScale;
uniform int renderer_SimulationSpace;

#include <particle_common>
#include <velocity_over_lifetime_module>
#include <force_over_lifetime_module>
#include <color_over_lifetime_module>
#include <size_over_lifetime_module>
#include <rotation_over_lifetime_module>
#include <texture_sheet_animation_module>
#include <noise_over_lifetime_module>

vec3 computeParticlePosition(in vec3 startVelocity, in float age, in float normalizedAge, vec3 gravityVelocity, vec4 worldRotation, inout vec3 localVelocity, inout vec3 worldVelocity) {
    vec3 startPosition = startVelocity * age;

    vec3 finalPosition;
    vec3 localPositionOffset = startPosition;
    vec3 worldPositionOffset;

    #ifdef _VOL_MODULE_ENABLED
        vec3 lifeVelocity;      
        vec3 velocityPositionOffset = computeVelocityPositionOffset(normalizedAge, age, lifeVelocity);
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
        vec3 forcePositionOffset = computeForcePositionOffset(normalizedAge, age, forceVelocity);
        if (renderer_FOLSpace == 0) {
            localVelocity += forceVelocity;
            localPositionOffset += forcePositionOffset;
        } else {
            worldVelocity += forceVelocity;
            worldPositionOffset += forcePositionOffset;
        }
    #endif

    finalPosition = rotationByQuaternions(a_ShapePositionStartLifeTime.xyz + localPositionOffset, worldRotation) + worldPositionOffset;

    if (renderer_SimulationSpace == 0) {
        finalPosition = finalPosition + renderer_WorldPosition;
    } else if (renderer_SimulationSpace == 1) {
	    finalPosition = finalPosition + a_SimulationWorldPosition;
	}

    finalPosition += 0.5 * gravityVelocity * age;

    return finalPosition;
}

void main() {
    float age = renderer_CurrentTime - a_DirectionTime.w;
    float normalizedAge = age / a_ShapePositionStartLifeTime.w;
    // normalizedAge >= 0.0: skip stale TF slots whose startTime is from a previous playback (e.g. after StopEmittingAndClear).
    if (normalizedAge >= 0.0 && normalizedAge < 1.0) {
        vec4 worldRotation;
        if (renderer_SimulationSpace == 0) {
            worldRotation = renderer_WorldRotation;
        } else {
            worldRotation = a_SimulationWorldRotation;
        }

        vec3 localVelocity;
        vec3 worldVelocity;

        #ifdef RENDERER_TRANSFORM_FEEDBACK
            // Transform Feedback mode: position in simulation space (local or world).
            // Local: transform to world; World: use directly.
            vec3 center;
            if (renderer_SimulationSpace == 0) {
                center = rotationByQuaternions(a_FeedbackPosition, worldRotation) + renderer_WorldPosition;
            } else if (renderer_SimulationSpace == 1) {
                center = a_FeedbackPosition;
            }
            localVelocity = a_FeedbackVelocity;
            worldVelocity = vec3(0.0);

            #ifdef _VOL_MODULE_ENABLED
                vec3 instantVOLVelocity;
                computeVelocityPositionOffset(normalizedAge, age, instantVOLVelocity);
                if (renderer_VOLSpace == 0) {
                    localVelocity += instantVOLVelocity;
                } else {
                    worldVelocity += instantVOLVelocity;
                }
            #endif

        #else
            // Original analytical path
            vec3 startVelocity = a_DirectionTime.xyz * a_StartSpeed;
            vec3 gravityVelocity = renderer_Gravity * a_Random0.x * age;
            localVelocity = startVelocity;
            worldVelocity = gravityVelocity;
            vec3 center = computeParticlePosition(startVelocity, age, normalizedAge, gravityVelocity, worldRotation, localVelocity, worldVelocity);
        #endif

        #include <sphere_billboard>
        #include <stretched_billboard>
        #include <horizontal_billboard>
        #include <vertical_billboard>
        #include <particle_mesh>

        gl_Position = camera_ProjMat * camera_ViewMat * vec4(center, 1.0);
        v_Color = computeParticleColor(a_StartColor, normalizedAge);

        #ifdef MATERIAL_HAS_BASETEXTURE
            vec2 simulateUV;
            #if defined(RENDERER_MODE_SPHERE_BILLBOARD) || defined(RENDERER_MODE_STRETCHED_BILLBOARD) || defined(RENDERER_MODE_HORIZONTAL_BILLBOARD) || defined(RENDERER_MODE_VERTICAL_BILLBOARD)
                simulateUV = a_CornerTextureCoordinate.zw * a_SimulationUV.xy + a_SimulationUV.zw;
                v_TextureCoordinate = computeParticleUV(simulateUV, normalizedAge);
            #endif
            #ifdef RENDERER_MODE_MESH
                simulateUV = a_SimulationUV.zw + TEXCOORD_0 * a_SimulationUV.xy;
                v_TextureCoordinate = computeParticleUV(simulateUV, normalizedAge);
            #endif
        #endif
    } else {
	    gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // Discard use out of X(-1,1),Y(-1,1),Z(0,1)
    }
}