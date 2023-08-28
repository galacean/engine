#ifdef RENDERER_MODE_HORIZONTAL_BILLBOARD
	vec2 corner = a_CornerTextureCoordinate.xy + renderer_PivotOffset.xy; // Billboard模式z轴无效
	const vec3 cameraUpVector = vec3(0.0, 0.0, 1.0);
	const vec3 sideVector = vec3(-1.0, 0.0, 0.0);

	float rot = computeParticleRotationFloat(a_StartRotation0.x, age, normalizedAge);
	float c = cos(rot);
	float s = sin(rot);
	mat2 rotation = mat2(c, -s, s, c);
	corner = rotation * corner * cos(0.78539816339744830961566084581988); // TODO:临时缩小cos45,不确定U3D原因
	corner *= computeParticleSizeBillboard(a_StartSize.xy, normalizedAge);
	center += renderer_SizeScale.xzy * (corner.x * sideVector + corner.y * cameraUpVector);
#endif