#define PI 3.14159265359

// Only support local alignment mode
#ifdef RENDERER_MODE_MESH
	vec3 size = computeParticleSizeMesh(a_StartSize, normalizedAge);
    #if defined(RENDERER_ROL_CONSTANT_MODE) || defined(RENDERER_ROL_CURVE_MODE)
        if (renderer_ThreeDStartRotation) {
            vec3 rotation = vec3(a_StartRotation0.xy, computeParticleRotationFloat(a_StartRotation0.z, age, normalizedAge));
            center += rotationByQuaternions(renderer_SizeScale * rotationByEuler(POSITION * size, rotation),worldRotation);
        } else {
            #ifdef RENDERER_ROL_IS_SEPARATE
                float angle = computeParticleRotationFloat(a_StartRotation0.x, age, normalizedAge);
                #ifdef RENDERER_EMISSION_SHAPE
                    vec3 crossResult = cross(vec3(0.0, 0.0, 1.0), vec3(a_ShapePositionStartLifeTime.xy, 0.0));
                    float crossLen = length(crossResult);
                    vec3 rotateAxis = crossLen > 0.0001 ? crossResult / crossLen : vec3(0.0, -1.0, 0.0);
                    center += rotationByQuaternions(rotationByAxis(renderer_SizeScale * POSITION * size, rotateAxis, angle), worldRotation);
                #else
                    if (renderer_SimulationSpace == 1)
                        center += rotationByAxis(renderer_SizeScale * POSITION * size, vec3(0.0, 0.0, -1.0), angle);
                    else if (renderer_SimulationSpace == 0)
                        center += rotationByQuaternions(renderer_SizeScale * rotationByAxis(POSITION * size, vec3(0.0, 0.0, -1.0), angle), worldRotation);
                #endif
            #endif
            #ifdef ROTATION_OVER_LIFETIME_SEPARATE
                // TODO:是否应合并if(renderer_ThreeDStartRotation)分支代码,待测试
                vec3 angle = computeParticleRotationVec3(vec3(0.0, 0.0, -a_StartRotation0.x), age, normalizedAge);
                center += (rotationByQuaternions(rotationByEuler(renderer_SizeScale * POSITION * size, vec3(angle.x, angle.y, angle.z)),worldRotation));
            #endif
        }
    #else
        if (renderer_ThreeDStartRotation) {
            center += rotationByQuaternions(renderer_SizeScale * rotationByEuler(POSITION * size, a_StartRotation0), worldRotation);
        } else {
            #ifdef RENDERER_EMISSION_SHAPE
                vec3 crossResult = cross(vec3(0.0, 0.0, 1.0), vec3(a_ShapePositionStartLifeTime.xy, 0.0));
                float crossLen = length(crossResult);
                vec3 rotateAxis = crossLen > 0.0001 ? crossResult / crossLen : vec3(0.0, -1.0, 0.0);
                if (renderer_SimulationSpace == 1)
                    center += rotationByAxis(renderer_SizeScale * POSITION * size, rotateAxis, a_StartRotation0.x);
                else if (renderer_SimulationSpace == 0)
                    center += rotationByQuaternions(renderer_SizeScale * rotationByAxis(POSITION * size, rotateAxis, a_StartRotation0.x), worldRotation);
            #else
                if (renderer_SimulationSpace == 1)
                    center += rotationByAxis(renderer_SizeScale * POSITION * size, vec3(0.0, 0.0, -1.0), a_StartRotation0.x);
                else if (renderer_SimulationSpace == 0)
                    center += rotationByQuaternions(renderer_SizeScale * rotationByAxis(POSITION * size, vec3(0.0, 0.0, -1.0), a_StartRotation0.x), worldRotation);
            #endif
        }
    #endif
    #ifdef RENDERER_ENABLE_VERTEXCOLOR
		v_MeshColor = COLOR_0;
	#endif
#endif