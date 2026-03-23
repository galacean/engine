#ifdef RENDERER_MODE_HORIZONTAL_BILLBOARD
	vec2 corner = a_CornerTextureCoordinate.xy + renderer_PivotOffset.xy;
	const vec3 sideVector = vec3(-1.0, 0.0, 0.0);
	const vec3 upVector = vec3(0.0, 0.0, 1.0);
	corner *= computeParticleSizeBillboard(a_StartSize.xy, normalizedAge);

	// HorizontalBillboard only rotates around Y-axis to keep particles in XZ plane.
	// In 3D mode, only the Y component of startRotation is used; X and Z are ignored.
	float rot;
	#if defined(RENDERER_ROL_CONSTANT_MODE) || defined(RENDERER_ROL_CURVE_MODE)
		if (renderer_ThreeDStartRotation) {
			rot = radians(computeParticleRotationFloatY(a_StartRotation0.y, age, normalizedAge));
		} else {
			rot = radians(computeParticleRotationFloatY(a_StartRotation0.x, age, normalizedAge));
		}
	#else
		if (renderer_ThreeDStartRotation) {
			rot = radians(a_StartRotation0.y);
		} else {
			rot = radians(a_StartRotation0.x);
		}
	#endif

	float c = cos(rot);
	float s = sin(rot);
	mat2 rotation = mat2(c, -s, s, c);
	corner = rotation * corner;
	center += renderer_SizeScale.xzy * (corner.x * sideVector + corner.y * upVector);
#endif