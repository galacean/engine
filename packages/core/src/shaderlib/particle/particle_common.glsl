vec3 rotationByQuaternions(in vec3 v, in vec4 q) {
    return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
}

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

    float cosYawPitch = cosYaw * cosPitch;
    float sinYawPitch = sinYaw * sinPitch;

    float quaX = (cosYaw * sinPitch * cosRoll) + (sinYaw * cosPitch * sinRoll);
    float quaY = (sinYaw * cosPitch * cosRoll) - (cosYaw * sinPitch * sinRoll);
    float quaZ = (cosYawPitch * sinRoll) - (sinYawPitch * cosRoll);
    float quaW = (cosYawPitch * cosRoll) + (sinYawPitch * sinRoll);

    return rotationByQuaternions(vector, vec4(quaX, quaY, quaZ, quaW));
}

// Assume axis is normalized
vec3 rotationByAxis(in vec3 vector, in vec3 axis, in float angle) {
    float halfAngle = angle * 0.5;
    float s = sin(halfAngle);

    return rotationByQuaternions(vector, vec4(axis * s, cos(halfAngle)));
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

float evaluateParticleCurveCumulative(in vec2 keys[4], in float normalizedAge, out float currentValue){
    float cumulativeValue = 0.0;
    for (int i = 1; i < 4; i++){
	    vec2 key = keys[i];
	    float time = key.x;
	    vec2 lastKey = keys[i - 1];
	    float lastValue = lastKey.y;

	    if (time >= normalizedAge){
		    float lastTime = lastKey.x;
            float offsetTime = normalizedAge - lastTime;
		    float age = offsetTime / (time - lastTime);
            currentValue = mix(lastValue, key.y, age);
		    cumulativeValue += (lastValue + currentValue) * 0.5 * offsetTime;
		    break;
		}
	    else{
		    cumulativeValue += (lastValue + key.y) * 0.5 * (time - lastKey.x);
		}
	}
    return cumulativeValue;
}