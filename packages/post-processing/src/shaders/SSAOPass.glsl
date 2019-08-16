precision highp float;
precision highp int;
#include <depth_packing>
#define SIN45 0.707107

varying vec2 v_uv;

uniform sampler2D s_sourceRT;
uniform sampler2D s_normalRT;
uniform sampler2D s_depthRT;

uniform float u_radius;
uniform float u_bias;
uniform vec2 u_attenuation;

uniform  mat4 u_projectionInvertMat;
uniform  mat4 u_projectionMat;

uniform float u_zNear;
uniform float u_zFar;
uniform float u_fov;

uniform float u_resolutionX;
uniform float u_resolutionY;


vec3 unpackRGBToNormal( const in vec3 rgb ) {
	return 2.0 * rgb.xyz - 1.0;
}

highp float random(ivec2 co)
{
    highp vec2 vco = vec2(co);
    highp float a = 12.9898;
    highp float b = 78.233;
    highp float c = 43758.5453;
    highp float dt = dot(vco.xy ,vec2(a,b));
    highp float sn = mod(dt,3.14);
    return fract(sin(sn) * c);
}

float getDepth(vec2 coord) {                          
  return texture2D(s_depthRT, coord.xy).x;
}   

vec3 getViewPosition(vec2 screenPos, float depth, float viewZ){

  float clipW = u_projectionMat[2][3]*viewZ + u_projectionMat[3][3];
  vec4 clipPosition = vec4(2.0*vec3(screenPos,depth) - 1.0,1.0);
  clipPosition *= clipW; 

  return (u_projectionInvertMat * clipPosition).xyz; 
}

#ifndef USE_DEPTH_PACKING

vec3 getPosition(vec2 uv){
  //z from buffer
  float depth = texture2D(s_depthRT,uv).x;
  //view depth
  float viewDepth = (u_zNear * u_zFar)/((u_zFar - u_zNear)*depth - u_zFar);

  //inverse projection
  float clipW = u_projectionMat[2][3]*viewDepth + u_projectionMat[3][3];
  vec4 clipPos = vec4(2.0*vec3(uv,depth) - 1.0,1.0);
  clipPos *= clipW;
  return (u_projectionInvertMat * clipPos).xyz; 
}

#else 
float unpackDepth(const in vec4 rgba_depth) {
  const vec4 bit_shift = vec4(1.0/(256.0*256.0*256.0), 1.0/(256.0*256.0), 1.0/256.0, 1.0);
  float depth = dot(rgba_depth, bit_shift);
  return depth;
}    

float getViweDepth(vec2 coord) {                          
  float depth = unpackDepth(texture2D(s_depthRT, coord.xy));
  float viewDepth = -(depth*(u_zFar - u_zNear) + u_zNear);
  return viewDepth;
}   

vec3 getViewRay(vec2 tc) {

  float fov = u_fov / 180.0 * 3.1415926535;
  float aspectRatio = u_resolutionX/u_resolutionY;

  float hfar = 2.0 * tan(fov/2.0) * u_zFar;
  float wfar = hfar * aspectRatio;    
  vec3 ray = vec3(wfar * (tc.x - 0.5), hfar * (tc.y - 0.5), -u_zFar);    
  return ray;                      
}   

vec3 getPosition(vec2 uv){
  float linearDepth = -getViweDepth(uv);          
  vec3 origin = getViewRay(uv) * linearDepth/u_zFar;  
  return origin;
}


#endif

float calcOcclusion(vec3 position, vec3 normal, ivec2 fragCoord) {

  vec2 occlu_uv = vec2((float(fragCoord.x)+0.5)/u_resolutionX,(float(fragCoord.y)+0.5)/u_resolutionY);
  vec3 occluderPosition = getPosition(occlu_uv);
  vec3 positionVec = occluderPosition - position;

  //for the same occluderposition and position
  if(length(positionVec) < 0.0001){
    return 0.0;
  }else{
    float intensity = max(dot(normal, normalize(positionVec)) - u_bias, 0.0);

    float attenuation = 1.0 / (u_attenuation.x + u_attenuation.y * length(positionVec));
    return intensity * attenuation;
  }
}



void main() {            

  ivec2 fragCoord = ivec2(gl_FragCoord.xy);

  vec3 normal = texture2D(s_normalRT,v_uv).xyz;
  normal = unpackRGBToNormal(normal);  

  #ifndef USE_DEPTH_PACKING
    float depthZ = getDepth(v_uv);
    float viewDepth = (u_zNear * u_zFar)/((u_zFar - u_zNear)*depthZ - u_zFar);
    vec3 position = getViewPosition(v_uv,depthZ,viewDepth);
    float sampleDepth = (abs(viewDepth) - u_zNear) / (u_zFar- u_zNear);
  #else
    float depthZ = unpackDepth(texture2D(s_depthRT,v_uv));
    float viewDepth = -(depthZ*(u_zFar - u_zNear) + u_zNear);
    vec3 position = getPosition(v_uv);
    float sampleDepth = depthZ;
  #endif
   
  float kernelRadius = u_radius * (1.0 - sampleDepth);

  vec2 kernel[4];
  kernel[0] = vec2(0.0, 1.0);
  kernel[1] = vec2(1.0, 0.0);
  kernel[2] = vec2(0.0, -1.0);
  kernel[3] = vec2(-1.0, 0.0);

  float occlusion = 0.0;

  
  int sampleNumber = 1;

  for(int j = 0;j < 1; ++j){

    for (int i = 0; i < 4; ++i) {

      vec2 seed = vec2(random(ivec2(fragCoord.x,fragCoord.y)),random(ivec2(fragCoord.y,fragCoord.x)));
      vec2 rand = normalize(seed);

      vec2 k1 = reflect(kernel[i], rand);
      vec2 k2 = vec2(k1.x * SIN45 - k1.y * SIN45, k1.x * SIN45 + k1.y * SIN45);

      k1 *= (kernelRadius);
      k2 *= (kernelRadius);

      occlusion += calcOcclusion(position, normal, fragCoord + ivec2(k1));
      occlusion += calcOcclusion(position, normal, fragCoord + ivec2(k2 * 0.75));
      occlusion += calcOcclusion(position, normal, fragCoord + ivec2(k1 * 0.5));
      occlusion += calcOcclusion(position, normal, fragCoord + ivec2(k2 * 0.25));
      }
  }


  occlusion = clamp(occlusion / (16.0*float(sampleNumber)), 0.0, 1.0);

  occlusion = 1.0 - occlusion;
  
  gl_FragColor = vec4(occlusion,occlusion,occlusion,1.0);

}