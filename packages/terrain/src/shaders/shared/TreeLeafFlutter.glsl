#ifndef TERRAIN_PROJECT_TREE_LEAF_FLUTTER_INCLUDED
#define TERRAIN_PROJECT_TREE_LEAF_FLUTTER_INCLUDED

// Tree wind's hero and near ranges end at 18 m and 52 m. Only the leaf-local
// oscillation fades. Use the viewer's distance to the rest root in every pass.
float terrainProjectTreeLeafFlutterScale(float distanceToTree) {
  return (1.0 - smoothstep(18.0, 52.0, distanceToTree)) / 3.0;
}

// A wave across the resting crown keeps adjacent leaf hinges close in phase.
// Its spatial gradient is in radians per metre, independent of camera and wind pose.
float terrainProjectTreeLeafFlutterPhase(vec3 restOffsetWS, float treePhase) {
  return treePhase * 6.2831853 + dot(restOffsetWS, vec3(0.45, 0.22, 0.35));
}

#endif
