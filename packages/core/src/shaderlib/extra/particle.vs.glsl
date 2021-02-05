attribute vec3 a_position;
attribute vec3 a_velocity;
attribute vec3 a_acceleration;
attribute vec4 a_color;

attribute vec4 a_lifeAndSize;
attribute vec2 a_rotation;

attribute vec3 a_uv;
attribute vec2 a_normalizedUv;

uniform float u_time;
uniform bool u_once;
uniform bool u_active;
uniform mat4 u_MVPMat;

varying vec4 v_color;
varying float v_lifeLeft;
varying vec2 v_uv;

#ifdef is2d
  uniform mat4 u_viewInvMat;
  uniform mat4 u_projMat;
  uniform mat4 u_viewMat;
  uniform mat4 u_modelMat;
#endif

mat2 rotation2d(float angle) {
  float s = sin(angle);
  float c = cos(angle);

  return mat2(
    c, -s,
    s, c
  );
}


void main() {
  v_color = a_color;
  v_uv = a_uv.xy;
  
  // Real life time
  float life = a_lifeAndSize.y + a_lifeAndSize.x;

  // Elapsed time
  float deltaTime = max(mod(u_time, life) - a_lifeAndSize.x, 0.0);

  bool isDying = false;

  if (u_once || !u_active) {
    isDying = true;
  }

  if ((isDying && u_time > life)) {
    deltaTime = life;
  }

  // Not born means death, otherwise it will be displayed if not born
  if (deltaTime == 0.0) {
    deltaTime = life;
  }

  v_lifeLeft = 1.0 - deltaTime / a_lifeAndSize.y;
  float scale = a_lifeAndSize.z;
  vec3 position = a_position + (a_velocity + a_acceleration * deltaTime * 0.5) * deltaTime;

  #ifdef isScaleByLifetime
    scale *= v_lifeLeft;
  #else
    scale *= pow(a_lifeAndSize.w, deltaTime);
  #endif

  #ifdef rotateToVelocity
    vec3 v = a_velocity + a_acceleration * deltaTime;
  #else
    float deltaAngle = deltaTime * a_rotation.y;
  #endif

  #ifdef is2d
    #ifdef rotateToVelocity
      float angle = atan(v.z, v.x) * 2.0;
    #else
      float angle = a_rotation.x + deltaAngle;
    #endif

    vec2 rotatedPoint = rotation2d(angle) * vec2(a_normalizedUv.x, a_normalizedUv.y * a_uv.z);

    vec3 basisX = u_viewInvMat[0].xyz;
    vec3 basisZ = u_viewInvMat[1].xyz;

    vec3 localPosition = vec3(basisX * rotatedPoint.x + 
                basisZ * rotatedPoint.y) * scale + position;

    gl_Position = u_projMat * u_viewMat * vec4(localPosition + u_modelMat[3].xyz, 1.);
  #else
    #ifdef rotateToVelocity
      float s = sin(angle);
      float c = cos(angle);
    #else
      float s = sin(angle);
      float c = cos(angle);
    #endif

    vec4 rotatedPoint = vec4((a_normalizedUv.x * c + a_normalizedUv.y * a_uv.z * s) * scale , 0., 
                              (a_normalizedUv.x * s - a_normalizedUv.y * a_uv.z * c) * scale, 1.);
  
    vec4 orientation = vec4(0, 0, 0, 1);
    vec4 q2 = orientation + orientation;
    vec4 qx = orientation.xxxw * q2.xyzx;
    vec4 qy = orientation.xyyw * q2.xyzy;
    vec4 qz = orientation.xxzw * q2.xxzz;
  
    mat4 localMatrix = mat4(
        (1.0 - qy.y) - qz.z, 
        qx.y + qz.w, 
        qx.z - qy.w,
        0,
  
        qx.y - qz.w, 
        (1.0 - qx.x) - qz.z, 
        qy.z + qx.w,
        0,
  
        qx.z + qy.w, 
        qy.z - qx.w, 
        (1.0 - qx.x) - qy.y,
        0,
  
        position.x, position.y, position.z, 1);

    rotatedPoint = localMatrix * rotatedPoint;

    gl_Position = u_MVPMat * rotatedPoint;
  #endif
}