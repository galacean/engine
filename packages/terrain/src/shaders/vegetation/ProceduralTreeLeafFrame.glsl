#ifndef TERRAIN_PROJECT_PROCEDURAL_TREE_LEAF_FRAME_INCLUDED
#define TERRAIN_PROJECT_PROCEDURAL_TREE_LEAF_FRAME_INCLUDED

sampler2D renderer_ProceduralTreeLeafFrames;
// x: per-LOD width scale, y: per-LOD height scale, z: additive half-extent, w: source LOD index.
vec4 renderer_ProceduralTreeLeafFrameScale;
// xyz: authored field origin in tree-local metres; w: radial blend (zero preserves surface normals).
vec4 renderer_ProceduralTreeLeafNormalField;

vec3 terrainProjectProceduralTreeLeafShadingNormalOS(vec3 positionOS, vec3 surfaceNormalOS) {
  vec3 direction = positionOS - renderer_ProceduralTreeLeafNormalField.xyz;
  float distance = length(direction);
  if (renderer_ProceduralTreeLeafNormalField.w == 0.0 || distance == 0.0) return surfaceNormalOS;
  vec3 blended = mix(surfaceNormalOS, direction / distance, renderer_ProceduralTreeLeafNormalField.w);
  float magnitude = length(blended);
  return magnitude == 0.0 ? surfaceNormalOS : blended / magnitude;
}

struct ProceduralTreeLeafFrame {
  vec3 pivotOS;
  vec3 rightOS;
  vec3 upOS;
  vec3 normalOS;
  float tangentHandedness;
  float halfWidth;
  float height;
  float canopyNormalConcentration;
  float canopyOpticalDepth;
};

vec4 terrainProjectProceduralTreeLeafFrameTexel(int leafIndex, int lane) {
  ivec2 textureDimensions = textureSize(renderer_ProceduralTreeLeafFrames, 0);
  int cardsPerRow = textureDimensions.x / 8;
  int row = leafIndex / cardsPerRow;
  int column = (leafIndex - row * cardsPerRow) * 8 + lane;
  return texelFetch(renderer_ProceduralTreeLeafFrames, ivec2(column, row), 0);
}

vec3 terrainProjectProceduralTreeLeafPivotOS(Attributes attributes) {
  int leafIndex = int(floor(attributes.TEXCOORD_2.x + 0.5));
  return terrainProjectProceduralTreeLeafFrameTexel(leafIndex, 0).xyz;
}

ProceduralTreeLeafFrame terrainProjectProceduralTreeLeafFrame(Attributes attributes) {
  int leafIndex = int(floor(attributes.TEXCOORD_2.x + 0.5));
  vec4 pivotAndWidth = terrainProjectProceduralTreeLeafFrameTexel(leafIndex, 0);
  vec4 rightAndHeight = terrainProjectProceduralTreeLeafFrameTexel(leafIndex, 1);
  vec4 upAndFlags = terrainProjectProceduralTreeLeafFrameTexel(leafIndex, 2);
  vec4 normalAndHandedness = terrainProjectProceduralTreeLeafFrameTexel(leafIndex, 3);
  int sourceLodIndex = int(floor(clamp(renderer_ProceduralTreeLeafFrameScale.w, 0.0, 3.0) + 0.5));
  vec4 canopyMomentAndDepth = terrainProjectProceduralTreeLeafFrameTexel(leafIndex, 4 + sourceLodIndex);
  float canopyNormalMomentLength = length(canopyMomentAndDepth.xyz);
  ProceduralTreeLeafFrame frame;
  frame.pivotOS = pivotAndWidth.xyz;
  frame.rightOS = normalize(rightAndHeight.xyz);
  frame.upOS = normalize(upAndFlags.xyz);
  frame.normalOS = canopyNormalMomentLength > 1e-8
    ? canopyMomentAndDepth.xyz / canopyNormalMomentLength
    : normalize(normalAndHandedness.xyz);
  frame.tangentHandedness = normalAndHandedness.w < 0.0 ? -1.0 : 1.0;
  frame.halfWidth = 0.5 * (
    pivotAndWidth.w * renderer_ProceduralTreeLeafFrameScale.x +
    renderer_ProceduralTreeLeafFrameScale.z * 2.0
  );
  frame.height =
    rightAndHeight.w * renderer_ProceduralTreeLeafFrameScale.y +
    renderer_ProceduralTreeLeafFrameScale.z * 2.0;
  frame.canopyNormalConcentration = clamp(canopyNormalMomentLength, 0.0, 1.0);
  frame.canopyOpticalDepth = max(canopyMomentAndDepth.w, 0.0);
  return frame;
}

vec3 terrainProjectProceduralTreeLeafNormalOS(ProceduralTreeLeafFrame frame, vec3 localNormal) {
  localNormal = normalize(localNormal * vec3(1.0, frame.halfWidth / frame.height, 1.0));
  return normalize(frame.rightOS * localNormal.x + frame.upOS * localNormal.y + frame.normalOS * localNormal.z);
}

vec3 terrainProjectProceduralTreeLeafShadingTangentOS(ProceduralTreeLeafFrame frame, vec3 normalOS) {
  vec3 tangent = frame.rightOS - normalOS * dot(frame.rightOS, normalOS);
  if (dot(tangent, tangent) < 1e-8) {
    tangent = frame.upOS - normalOS * dot(frame.upOS, normalOS);
  }
  return normalize(tangent);
}

vec3 terrainProjectProceduralTreeLeafTangentOS(ProceduralTreeLeafFrame frame) {
  return terrainProjectProceduralTreeLeafShadingTangentOS(frame, frame.normalOS);
}

vec3 terrainProjectProceduralTreeLeafPositionOS(ProceduralTreeLeafFrame frame, vec3 shapePosition) {
  vec3 local = shapePosition * vec3(frame.halfWidth, frame.height, frame.halfWidth);
  return frame.pivotOS + frame.rightOS * local.x + frame.upOS * local.y + normalize(cross(frame.rightOS, frame.upOS)) * local.z;
}

#endif
