#ifdef RENDERER_MODE_STRETCHED_BILLBOARD
	vec2 corner = a_CornerTextureCoordinate.xy; // Billboard模式z轴无效
	vec3 velocity;
    #if defined(RENDERER_VOL_CONSTANT) || defined(RENDERER_VOL_CURVE) || defined(RENDERER_VOL_RANDOM_CONSTANT) || defined(RENDERER_VOL_RANDOM_CURVE)
        if (renderer_VOLSpace == 0)
            velocity = rotationByQuaternions(u_SizeScale * (startVelocity + lifeVelocity),
                   worldRotation)
            + gravityVelocity;
        else
            velocity = rotationByQuaternions(u_SizeScale * startVelocity, worldRotation) + lifeVelocity + gravityVelocity;
    #else
	    velocity = rotationByQuaternions(u_SizeScale * startVelocity, worldRotation) + gravityVelocity;
    #endif
	vec3 cameraUpVector = normalize(velocity);
	vec3 direction = normalize(center - u_cameraPos);
	vec3 sideVector = normalize(cross(direction, normalize(velocity)));

	sideVector = u_SizeScale.xzy * sideVector;
	cameraUpVector = length(vec3(u_SizeScale.x, 0.0, 0.0)) * cameraUpVector;

	vec2 size = computeParticleSizeBillboard(a_StartSize.xy, normalizedAge);

	const mat2 rotationZHalfPI = mat2(0.0, -1.0, 1.0, 0.0);
	corner = rotationZHalfPI * corner;
	corner.y = corner.y - abs(corner.y);

	float speed = length(velocity); // TODO:
	center += sign(u_SizeScale.x) * (sign(u_StretchedBillboardLengthScale) * size.x * corner.x * sideVector
	        + (speed * u_StretchedBillboardSpeedScale + size.y * u_StretchedBillboardLengthScale) * corner.y * cameraUpVector);
#endif