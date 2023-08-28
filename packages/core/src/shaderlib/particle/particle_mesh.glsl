#ifdef RENDERER_MODE_MESH
	vec3 size = computeParticleSizeMesh(a_StartSize, normalizedAge);
    #if defined(RENDERER_ROL_CONSTANT_MODE) || defined(RENDERER_ROL_CURVE_MODE)
        if (renderer_ThreeDStartRotation) {
            vec3 rotation = vec3(
            a_StartRotation0.xy,
            computeParticleRotationFloat(a_StartRotation0.z, age, normalizedAge));
            center += rotationByQuaternions(
            renderer_SizeScale * rotationByEuler(a_MeshPosition * size, rotation),
            worldRotation);
        } else {
        #ifdef RENDERER_ROL_IS_SEPARATE
            float angle = computeParticleRotationFloat(a_StartRotation0.x, age, normalizedAge);
            if (a_ShapePositionStartLifeTime.x != 0.0 || a_ShapePositionStartLifeTime.y != 0.0) {
            center += (rotationByQuaternions(
                rotationByAxis(
                renderer_SizeScale * a_MeshPosition * size,
                normalize(cross(vec3(0.0, 0.0, 1.0),
                    vec3(a_ShapePositionStartLifeTime.xy, 0.0))),
                angle),
                worldRotation)); //已验证
            } else {
            #ifdef SHAPE
                center += renderer_SizeScale.xzy * (rotationByQuaternions(rotationByAxis(a_MeshPosition * size, vec3(0.0, -1.0, 0.0), angle), worldRotation));
            #else
                if (renderer_SimulationSpace == 1)
                    center += rotationByAxis(renderer_SizeScale * a_MeshPosition * size,
                    vec3(0.0, 0.0, -1.0),
                    angle); //已验证
                else if (renderer_SimulationSpace == 0)
                    center += rotationByQuaternions(
                    renderer_SizeScale * rotationByAxis(a_MeshPosition * size, vec3(0.0, 0.0, -1.0), angle),
                    worldRotation); //已验证
            #endif
            }
        #endif
        #ifdef ROTATION_OVER_LIFETIME_SEPARATE
            // TODO:是否应合并if(renderer_ThreeDStartRotation)分支代码,待测试
            vec3 angle = computeParticleRotationVec3(
            vec3(0.0, 0.0, -a_StartRotation0.x), age, normalizedAge);
            center += (rotationByQuaternions(
            rotationByEuler(renderer_SizeScale * a_MeshPosition * size,
                vec3(angle.x, angle.y, angle.z)),
            worldRotation)); //已验证
        #endif
        }
    #else
        if (renderer_ThreeDStartRotation) {
            center += rotationByQuaternions(
            renderer_SizeScale * rotationByEuler(a_MeshPosition * size, a_StartRotation0),
            worldRotation); //已验证
        } else {
            if (a_ShapePositionStartLifeTime.x != 0.0 || a_ShapePositionStartLifeTime.y != 0.0) {
            if (renderer_SimulationSpace == 1)
                center += rotationByAxis(
                renderer_SizeScale * a_MeshPosition * size,
                normalize(cross(vec3(0.0, 0.0, 1.0),
                    vec3(a_ShapePositionStartLifeTime.xy, 0.0))),
                a_StartRotation0.x);
            else if (renderer_SimulationSpace == 0)
                center += (rotationByQuaternions(
                renderer_SizeScale * rotationByAxis(a_MeshPosition * size, normalize(cross(vec3(0.0, 0.0, 1.0),
                                             vec3(a_ShapePositionStartLifeTime.xy, 0.0))), a_StartRotation0.x),
                worldRotation)); //已验证
            } else {
        #ifdef SHAPE
            if (renderer_SimulationSpace == 1)
                center += renderer_SizeScale * rotationByAxis(a_MeshPosition * size, vec3(0.0, -1.0, 0.0), a_StartRotation0.x);
            else if (renderer_SimulationSpace == 0)
                center += rotationByQuaternions(
                renderer_SizeScale * rotationByAxis(a_MeshPosition * size, vec3(0.0, -1.0, 0.0), a_StartRotation0.x),
                worldRotation);
        #else
            if (renderer_SimulationSpace == 1)
                center += rotationByAxis(renderer_SizeScale * a_MeshPosition * size,
                vec3(0.0, 0.0, -1.0),
                a_StartRotation0.x);
            else if (renderer_SimulationSpace == 0)
                center += rotationByQuaternions(
                renderer_SizeScale * rotationByAxis(a_MeshPosition * size, vec3(0.0, 0.0, -1.0), a_StartRotation0.x),
                worldRotation); //已验证
        #endif
            }
        }
    #endif
	v_MeshColor = a_MeshColor;
#endif