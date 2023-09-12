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
uniform mat4 renderer_MVPMat;

varying vec4 v_color;
varying float v_lifeLeft;
varying vec2 v_uv;

#ifdef is2d
  uniform mat4 camera_ViewInvMat;
  uniform mat4 camera_ProjMat;
  uniform mat4 camera_ViewMat;
  uniform mat4 renderer_ModelMat;
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
  
  // life time
  float life = a_lifeAndSize.y;
  float startTime = a_lifeAndSize.x;

  // Elapsed time
  float deltaTime = max(mod(u_time - startTime, life), 0.0);

  if ((u_once && u_time > life + startTime)) {
    deltaTime = 0.0;
  }

  v_lifeLeft = 1.0 - deltaTime / life;
  float scale = a_lifeAndSize.z;
  vec3 position = a_position + (a_velocity + a_acceleration * deltaTime * 0.5) * deltaTime;

  #ifdef isScaleByLifetime
    scale *= v_lifeLeft;
  #else
    scale *= pow(a_lifeAndSize.w, deltaTime);
  #endif

  #ifdef rotateToVelocity
    vec3 v = a_velocity + a_acceleration * deltaTime;
    float angle = atan(v.z, v.x) * 2.0;
  #else
    float deltaAngle = deltaTime * a_rotation.y;
    float angle = a_rotation.x + deltaAngle;
  #endif

  #ifdef is2d

    vec2 rotatedPoint = rotation2d(angle) * vec2(a_normalizedUv.x, a_normalizedUv.y * a_uv.z);

    vec3 basisX = camera_ViewInvMat[0].xyz;
    vec3 basisZ = camera_ViewInvMat[1].xyz;

    vec3 localPosition = vec3(basisX * rotatedPoint.x + 
                basisZ * rotatedPoint.y) * scale + position;

    gl_Position = camera_ProjMat * camera_ViewMat * vec4(localPosition + renderer_ModelMat[3].xyz, 1.);
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

    gl_Position = renderer_MVPMat * rotatedPoint;
  #endif
}