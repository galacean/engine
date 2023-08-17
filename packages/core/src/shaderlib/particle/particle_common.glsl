

vec3 rotationByEuler(in vec3 vector, in vec3 rot) {
    float halfRoll = rot.z * 0.5;
    float halfPitch = rot.x * 0.5;
    float halfYaw = rot.y * 0.5;

    float sinRoll = sin(halfRoll);
    float cosRoll = cos(halfRoll);
    float sinPitch = sin(halfPitch);
    float cosPitch = cos(halfPitch);
    float sinYaw = sin(halfYaw);
    float cosYaw = cos(halfYaw);

    float quaX = (cosYaw * sinPitch * cosRoll) + (sinYaw * cosPitch * sinRoll);
    float quaY = (sinYaw * cosPitch * cosRoll) - (cosYaw * sinPitch * sinRoll);
    float quaZ = (cosYaw * cosPitch * sinRoll) - (sinYaw * sinPitch * cosRoll);
    float quaW = (cosYaw * cosPitch * cosRoll) + (sinYaw * sinPitch * sinRoll);

    // vec4 q=vec4(quaX,quaY,quaZ,quaW);
    // vec3 temp = cross(q.xyz, vector) + q.w * vector;
    // return (cross(temp, -q.xyz) + dot(q.xyz,vector) * q.xyz + q.w * temp);

    float x = quaX + quaX;
    float y = quaY + quaY;
    float z = quaZ + quaZ;
    float wx = quaW * x;
    float wy = quaW * y;
    float wz = quaW * z;
    float xx = quaX * x;
    float xy = quaX * y;
    float xz = quaX * z;
    float yy = quaY * y;
    float yz = quaY * z;
    float zz = quaZ * z;

    return vec3(((vector.x * ((1.0 - yy) - zz)) + (vector.y * (xy - wz))) + (vector.z * (xz + wy)),
	((vector.x * (xy + wz)) + (vector.y * ((1.0 - xx) - zz))) + (vector.z * (yz - wx)),
	((vector.x * (xz - wy)) + (vector.y * (yz + wx))) + (vector.z * ((1.0 - xx) - yy)));
}

//假定axis已经归一化
vec3 rotationByAxis(in vec3 vector, in vec3 axis, in float angle) {
    float halfAngle = angle * 0.5;
    float sin = sin(halfAngle);

    float quaX = axis.x * sin;
    float quaY = axis.y * sin;
    float quaZ = axis.z * sin;
    float quaW = cos(halfAngle);

    // vec4 q=vec4(quaX,quaY,quaZ,quaW);
    // vec3 temp = cross(q.xyz, vector) + q.w * vector;
    // return (cross(temp, -q.xyz) + dot(q.xyz,vector) * q.xyz + q.w * temp);

    float x = quaX + quaX;
    float y = quaY + quaY;
    float z = quaZ + quaZ;
    float wx = quaW * x;
    float wy = quaW * y;
    float wz = quaW * z;
    float xx = quaX * x;
    float xy = quaX * y;
    float xz = quaX * z;
    float yy = quaY * y;
    float yz = quaY * z;
    float zz = quaZ * z;

    return vec3(((vector.x * ((1.0 - yy) - zz)) + (vector.y * (xy - wz))) + (vector.z * (xz + wy)),
	((vector.x * (xy + wz)) + (vector.y * ((1.0 - xx) - zz))) + (vector.z * (yz - wx)),
	((vector.x * (xz - wy)) + (vector.y * (yz + wx))) + (vector.z * ((1.0 - xx) - yy)));
}

vec3 rotationByQuaternions(in vec3 v, in vec4 q) {
    return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
}


float evaluateParticleCurve(in vec2 keys[4], in float normalizedAge) {
    float value;
    for (int i = 1; i < 4; i++) {
        vec2 key = keys[i];
        float time = key.x;
        if (time >= normalizedAge) {
            vec2 lastKey = keys[i - 1];
            float lastTime = lastKey.x;
            float age = (normalizedAge - lastTime) / (time - lastTime);
            value = mix(lastKey.y, key.y, age);
            break;
        }
    }
    return value;
}