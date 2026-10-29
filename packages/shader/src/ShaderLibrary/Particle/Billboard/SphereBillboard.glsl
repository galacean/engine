#ifndef SPHERE_BILLBOARD_INCLUDED
#define SPHERE_BILLBOARD_INCLUDED

#ifdef RENDERER_MODE_SPHERE_BILLBOARD
	vec2 corner = a_CornerTextureCoordinate.xy + renderer_PivotOffset.xy;
	vec3 sideVector = normalize(cross(camera_Forward, camera_Up));
	vec3 upVector = normalize(cross(sideVector, camera_Forward));
	corner *= computeParticleSizeBillboard(a_StartSize.xy, normalizedAge);
    #if defined(RENDERER_ROL_CONSTANT_MODE) || defined(RENDERER_ROL_CURVE_MODE)
        if (renderer_ThreeDStartRotation) {
            vec3 rotation = radians(vec3(a_StartRotationSpeed.xy, computeParticleRotationFloat(a_StartRotationSpeed.z, age, normalizedAge)));
            center += renderer_SizeScale.xzy * rotationByEuler(corner.x * sideVector + corner.y * upVector, rotation);
        } else {
            float rot = radians(computeParticleRotationFloat(a_StartRotationSpeed.x, age, normalizedAge));
            float c = cos(rot);
            float s = sin(rot);
            mat2 rotation = mat2(c, -s, s, c);
            corner = rotation * corner;
            center += renderer_SizeScale.xzy * (corner.x * sideVector + corner.y * upVector);
        }
    #else
        if (renderer_ThreeDStartRotation) {
            center += renderer_SizeScale.xzy * rotationByEuler(corner.x * sideVector + corner.y * upVector, radians(a_StartRotationSpeed.xyz));
        } else {
            float c = cos(radians(a_StartRotationSpeed.x));
            float s = sin(radians(a_StartRotationSpeed.x));
            mat2 rotation = mat2(c, -s, s, c);
            corner = rotation * corner;
            center += renderer_SizeScale.xzy * (corner.x * sideVector + corner.y * upVector);
        }
    #endif
#endif

#endif
