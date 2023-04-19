uniform mat4 camera_ProjMat;
uniform mat4 camera_ViewMat;

uniform float u_textureTileS;
uniform float u_textureTileT;
uniform float u_textureDragging;

uniform vec4 u_headColor;
uniform vec4 u_tailColor;

uniform float u_currentTime;
uniform float u_trailLifeTime;

attribute vec3 a_position;
attribute vec3 a_nodeCenter;
attribute vec3 a_nodeIndexData;

varying vec2 v_uv;
varying vec4 vColor;

void main(){

  float nodeIndex = a_nodeIndexData.x;
  float vertexNodeIndex = a_nodeIndexData.y;
  float trailBirthTime =  a_nodeIndexData.z;

  float normalizeTime = (u_currentTime - trailBirthTime) / u_trailLifeTime;
  float s = 0.0;
  float t = 0.0;
  if (u_textureDragging == 1.0) { 
    s = normalizeTime * u_textureTileS; 
    t = vertexNodeIndex * u_textureTileT;
  } else { 
    s = nodeIndex / 60.0 * u_textureTileS;
    t = vertexNodeIndex * u_textureTileT;
  }
  v_uv = vec2( s, t );
  vec4 realPosition = vec4( ( 1.0 - normalizeTime ) * a_position.xyz + normalizeTime * a_position.xyz, 1.0 ); 
  gl_Position = camera_ProjMat * camera_ViewMat * realPosition;

  if (normalizeTime < 1.0){
    vColor = ( 1.0 - normalizeTime ) * u_headColor + normalizeTime * u_tailColor;
  }
}
