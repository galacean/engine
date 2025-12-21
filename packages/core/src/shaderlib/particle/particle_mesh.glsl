#define PI 3.14159265359

// Only support local alignment mode
#ifdef RENDERER_MODE_MESH
    #if defined(RENDERER_ROL_CONSTANT_MODE) || defined(RENDERER_ROL_CURVE_MODE)
        #define RENDERER_ROL_ENABLED
    #endif

	vec3 size = computeParticleSizeMesh(a_StartSize, normalizedAge);

    bool is3DRotation = renderer_ThreeDStartRotation;
    #if defined(RENDERER_ROL_ENABLED) && defined(RENDERER_ROL_IS_SEPARATE)
        is3DRotation = true;
    #endif

    if (is3DRotation) {
        #ifdef RENDERER_ROL_ENABLED
            vec3 startRotation = renderer_ThreeDStartRotation ? a_StartRotation0 : vec3(0.0, 0.0, a_StartRotation0.x);
            vec3 rotation = computeParticleRotationVec3(startRotation, age, normalizedAge);
        #else
            vec3 rotation = a_StartRotation0;
        #endif
        // 3D Start Rotation is same in local and world simulation space
        center += rotationByQuaternions(renderer_SizeScale * rotationByEuler(POSITION * size, rotation), worldRotation);
    } else {
        #ifdef RENDERER_ROL_ENABLED
            float angle = computeParticleRotationFloat(a_StartRotation0.x, age, normalizedAge);
        #else
            float angle = a_StartRotation0.x;
        #endif
        #ifdef RENDERER_EMISSION_SHAPE
            // Axis is side vector of emit position look at zero
            vec3 axis = vec3(a_ShapePositionStartLifeTime.xy, 0.0);
            if (renderer_SimulationSpace == 1){
                axis = rotationByQuaternions(axis, worldRotation);
            }
            vec3 crossResult = cross(axis, vec3(0.0, 0.0, -1.0));
            float crossLen = length(crossResult);
            vec3 rotateAxis = crossLen > 0.0001 ? crossResult / crossLen : vec3(0.0, 1.0, 0.0);
        #else
            // Axis is negative z
            vec3 rotateAxis = vec3(0.0, 0.0, -1.0);
        #endif
        center += rotationByQuaternions(renderer_SizeScale *rotationByAxis(POSITION * size, rotateAxis, angle), worldRotation);
    }
    #ifdef RENDERER_ENABLE_VERTEXCOLOR
		v_MeshColor = COLOR_0;
	#endif
#endif