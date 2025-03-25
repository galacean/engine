#if defined(RENDERER_MODE_SPHERE_BILLBOARD) || defined(RENDERER_MODE_STRETCHED_BILLBOARD) || defined(RENDERER_MODE_HORIZONTAL_BILLBOARD) || defined(RENDERER_MODE_VERTICAL_BILLBOARD)
    attribute vec4 a_CornerTextureCoordinate;
#endif

#ifdef RENDERER_MODE_MESH
    attribute vec3 a_MeshPosition;
    attribute vec4 a_MeshColor;
    attribute vec2 a_MeshTextureCoordinate;
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

attribute vec3 a_SimulationWorldPosition;
attribute vec4 a_SimulationWorldRotation;

varying vec4 v_Color;
#ifdef MATERIAL_HAS_BASETEXTURE
    attribute vec4 a_SimulationUV;
    varying vec2 v_TextureCoordinate;
#endif

uniform float renderer_CurrentTime;
uniform vec3 renderer_Gravity;
uniform vec2 u_DragConstant;
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

vec3 getStartPosition(vec3 startVelocity, float age, vec3 dragData) {
    vec3 startPosition;
    float lastTime = min(startVelocity.x / dragData.x, age); // todo 0/0
    startPosition = lastTime * (startVelocity - 0.5 * dragData * lastTime);
    return startPosition;
}

vec3 computeParticlePosition(in vec3 startVelocity, in float age, in float normalizedAge, vec3 gravityVelocity, vec4 worldRotation, vec3 dragData, out vec3 lifeVelocity) {
    vec3 startPosition = getStartPosition(startVelocity, age, dragData);

    vec3 finalPosition;
    vec3 localPositionOffset = startPosition;
    vec3 worldPositionOffset;

    #ifdef _VOL_MODULE_ENABLED      
        vec3 velocityPositionOffset = computeVelocityPositionOffset(normalizedAge, age, lifeVelocity);
        if (renderer_VOLSpace == 0) {
            localPositionOffset += velocityPositionOffset;
        } else {
            worldPositionOffset += velocityPositionOffset;
        }
    #endif

    #ifdef _FOL_MODULE_ENABLED
        vec3 forcePositionOffset = computeForcePositionOffset(normalizedAge, age);
        if (renderer_FOLSpace == 0) {
            localPositionOffset += forcePositionOffset;
        } else {
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
    if (normalizedAge < 1.0) {
        vec3 startVelocity = a_DirectionTime.xyz * a_StartSpeed;
        vec3 gravityVelocity = renderer_Gravity * a_Random0.x * age;

        vec4 worldRotation;
        if (renderer_SimulationSpace == 0) {
            worldRotation = renderer_WorldRotation;
        } else {
            worldRotation = a_SimulationWorldRotation;
        }

        vec3 lifeVelocity;
        //drag
        vec3 dragData = a_DirectionTime.xyz * mix(u_DragConstant.x, u_DragConstant.y, a_Random0.x);
        vec3 center = computeParticlePosition(startVelocity, age, normalizedAge, gravityVelocity, worldRotation, dragData, lifeVelocity);

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
                simulateUV = a_SimulationUV.xy + a_MeshTextureCoordinate * a_SimulationUV.zw;
                v_TextureCoordinate = computeParticleUV(simulateUV, normalizedAge);
            #endif
        #endif
    } else {
	    gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // Discard use out of X(-1,1),Y(-1,1),Z(0,1)
    }
}