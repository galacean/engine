#ifdef RENDERER_MODE_SPHERE_BILLBOARD
	vec2 corner = a_CornerTextureCoordinate.xy + renderer_PivotOffset.xy; // Billboard模式z轴无效
	vec3 sideVector = normalize(cross(camera_Forward, camera_Up));
	vec3 upVector = normalize(cross(sideVector, camera_Forward));
	corner *= computeParticleSizeBillboard(a_StartSize.xy, normalizedAge);
    #if defined(RENDERER_ROL_CONSTANT_MODE) || defined(RENDERER_ROL_CURVE_MODE)
        if (renderer_ThreeDStartRotation) {
            vec3 rotation = vec3(a_StartRotation0.xy, computeParticleRotationFloat(a_StartRotation0.z, age, normalizedAge));
            center += renderer_SizeScale.xzy * rotationByEuler(corner.x * sideVector + corner.y * upVector, rotation);
        } else {
            float rot = computeParticleRotationFloat(a_StartRotation0.x, age, normalizedAge);
            float c = cos(rot);
            float s = sin(rot);
            mat2 rotation = mat2(c, -s, s, c);
            corner = rotation * corner;
            center += renderer_SizeScale.xzy * (corner.x * sideVector + corner.y * upVector);
        }
    #else
        if (renderer_ThreeDStartRotation) {
            center += renderer_SizeScale.xzy * rotationByEuler(corner.x * sideVector + corner.y * upVector, a_StartRotation0);
        } else {
            float c = cos(a_StartRotation0.x);
            float s = sin(a_StartRotation0.x);
            mat2 rotation = mat2(c, -s, s, c);
            corner = rotation * corner;
            center += renderer_SizeScale.xzy * (corner.x * sideVector + corner.y * upVector);
        }
    #endif
#endif