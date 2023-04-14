uniform mat4 camera_ProjMat;
uniform mat4 camera_ViewMat;

uniform float u_textureTileS;
uniform float u_textureTileT;

uniform vec4 u_headColor;
uniform vec4 u_tailColor;

uniform float u_currentTime;
uniform float u_trailLifeTime;

attribute vec3 a_position;
attribute vec3 a_nodeCenter;

attribute float a_nodeIndex;
attribute float a_vertexNodeIndex;
attribute float a_trailBirthTime;

varying vec2 v_uv;
varying vec4 vColor;

void main(){
  float s = a_nodeIndex / 80.0 * u_textureTileS;
  float t = a_vertexNodeIndex * u_textureTileT;
  v_uv = vec2( s, t );

  float normalizeTime = (u_currentTime - a_trailBirthTime) / u_trailLifeTime;
  vec4 realPosition = vec4( ( 1.0 - normalizeTime ) * a_position.xyz + normalizeTime * a_nodeCenter.xyz, 1.0 ); 
  gl_Position = camera_ProjMat * camera_ViewMat * realPosition;

  if (normalizeTime < 1.0){
    vColor = ( 1.0 - normalizeTime ) * u_headColor + normalizeTime * u_tailColor;
  }
}
