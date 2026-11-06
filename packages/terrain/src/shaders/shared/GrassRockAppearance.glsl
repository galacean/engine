#ifndef TERRAIN_PROJECT_GRASS_ROCK_APPEARANCE_INCLUDED
#define TERRAIN_PROJECT_GRASS_ROCK_APPEARANCE_INCLUDED
#include "shared/RockGrassGround.glsl"
#include "shared/RockTerrainContact.glsl"

vec3 grassRockEdgeWeights(vec3 p, vec3 a, vec3 b, vec3 wa, vec3 wb) {
  vec3 edge = b - a;
  float t = clamp(dot(p - a, edge) / max(dot(edge, edge), 0.000001), 0.0, 1.0);
  return mix(wa, wb, t);
}

// Exact closest point on the selected finite triangle, not an unbounded wall plane.
vec3 grassRockClosestWeights(vec3 p, vec3 a, vec3 b, vec3 c) {
  vec3 u = b - a, v = c - a, w = p - a;
  float uu = dot(u, u), uv = dot(u, v), vv = dot(v, v);
  float d = uu * vv - uv * uv;
  if (d > 0.000001) {
    float wb = (dot(w, u) * vv - dot(w, v) * uv) / d;
    float wc = (dot(w, v) * uu - dot(w, u) * uv) / d;
    if (wb >= 0.0 && wc >= 0.0 && wb + wc <= 1.0) return vec3(1.0 - wb - wc, wb, wc);
  }
  vec3 ab = grassRockEdgeWeights(p, a, b, vec3(1,0,0), vec3(0,1,0));
  vec3 bc = grassRockEdgeWeights(p, b, c, vec3(0,1,0), vec3(0,0,1));
  vec3 ca = grassRockEdgeWeights(p, c, a, vec3(0,0,1), vec3(1,0,0));
  vec3 da = p - (a * ab.x + b * ab.y + c * ab.z);
  vec3 db = p - (a * bc.x + b * bc.y + c * bc.z);
  vec3 dc = p - (a * ca.x + b * ca.y + c * ca.z);
  if (dot(da,da) <= dot(db,db) && dot(da,da) <= dot(dc,dc)) return ab;
  if (dot(db,db) <= dot(dc,dc)) return bc;
  return ca;
}

void terrainProjectGrassRockAppearance(vec3 positionWS, Attributes attributes,
    out vec4 colorWeight, out vec4 normalSnow) {
  colorWeight = vec4(0.0);
  normalSnow = vec4(0.0, 1.0, 0.0, 0.0);
  if (attributes.DETAIL_ROCK_META.z > 0.5) {
    vec3 a = attributes.DETAIL_ROCK_A.xyz, b = attributes.DETAIL_ROCK_B.xyz, c = attributes.DETAIL_ROCK_C.xyz;
    vec3 bary = grassRockClosestWeights(positionWS, a, b, c);
    vec3 surfacePosition = a * bary.x + b * bary.y + c * bary.z;
    float weight = 1.0 - smoothstep(0.06, 0.35, length(positionWS - surfacePosition));
    if (weight > 0.0) {
      float coverage = dot(bary, vec3(attributes.DETAIL_ROCK_A.w, attributes.DETAIL_ROCK_B.w, attributes.DETAIL_ROCK_C.w));
      vec3 normal = normalize(attributes.DETAIL_ROCK_NA.xyz * bary.x + attributes.DETAIL_ROCK_NB.xyz * bary.y + attributes.DETAIL_ROCK_NC.xyz * bary.z);
      vec4 ground = terrainProjectRockGrassGround(surfacePosition, normal,
        vec3(coverage, attributes.DETAIL_ROCK_META.xy), terrainProjectGrassSurfaceColor(surfacePosition));
      normal = terrainProjectAttachedReliefNormal(surfacePosition, normal, coverage);
      float snow = 0.72;
      float clearance = dot(bary, vec3(attributes.DETAIL_ROCK_NA.w, attributes.DETAIL_ROCK_NB.w, attributes.DETAIL_ROCK_NC.w));
      terrainProjectBlendRockContact(surfacePosition, clearance, ground, normal, snow);
      colorWeight = vec4(ground.rgb, weight);
      normalSnow = vec4(normal, snow);
    }
  }
}
#endif
