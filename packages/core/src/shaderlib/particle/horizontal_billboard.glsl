#ifdef RENDERER_MODE_HORIZONTAL_BILLBOARD
	vec2 corner = a_CornerTextureCoordinate.xy + renderer_PivotOffset.xy;
	const vec3 sideVector = vec3(1.0, 0.0, 0.0);
	const vec3 upVector = vec3(0.0, 0.0, -1.0);
	corner *= computeParticleSizeBillboard(a_StartSize.xy, normalizedAge);

	// HorizontalBillboard rotates in XZ plane (around Y-axis normal).
	// Uses Z-axis rotation data to match Unity behavior.
	float rot;
	if (renderer_ThreeDStartRotation) {
		rot = radians(computeParticleRotationFloat(a_StartRotation0.z, age, normalizedAge));
	} else {
		rot = radians(computeParticleRotationFloat(a_StartRotation0.x, age, normalizedAge));
	}

	float c = cos(rot);
	float s = sin(rot);
	mat2 rotation = mat2(c, -s, s, c);
	corner = rotation * corner;
	center += renderer_SizeScale.xzy * (corner.x * sideVector + corner.y * upVector);
#endif