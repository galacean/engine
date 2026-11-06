// Continuous cellular edge normals; texture and picking identities remain independent.
vec3 cellularMod289(vec3 x) { return x - 289.0 * sign(x) * floor(abs(x) / 289.0); }
vec2 cellularMod289v2(vec2 x) { return x - 289.0 * sign(x) * floor(abs(x) / 289.0); }
vec3 cellularPermute(vec3 x) { return cellularMod289(((x * 34.0) + 1.0) * x); }
float cellularEdgeNoise(vec2 v) {
  vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = x0.x > x0.y ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = cellularMod289v2(i);
  vec3 p = cellularPermute(cellularPermute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m *= m; m *= m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 a0 = x - floor(x + 0.5);
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
  vec3 g = vec3(a0.x*x0.x + h.x*x0.y, a0.y*x12.x + h.y*x12.y, a0.z*x12.z + h.z*x12.w);
  return 130.0 * dot(m,g);
}

vec3 cellularLightingNormal(Varyings v, vec3 faceNormal) {
  vec3 altitudes = vec3(v.rockNeighbor0.w, v.rockNeighbor1.w, v.rockNeighbor2.w);
  float scale = max(v.rockCell.x, 0.000001);
  // Barycentric weight times the opposite altitude is the perpendicular
  // distance. No branch selects a different normal on stretched triangles.
  vec3 distances = max(v.rockBarycentrics.zxy, vec3(0.0)) * abs(altitudes) / scale;
  vec3 widths = mix(vec3(0.08), vec3(0.20), step(vec3(0.0), altitudes));
  vec3 sourcePosition = v.positionWS / scale;
  float noise = clamp(cellularEdgeNoise(sourcePosition.xz + vec2(sourcePosition.y*0.5)), -1.0, 1.0);
  // Noise changes a positive band width, never the sign of an edge distance.
  widths *= 1.0 + 0.35 * noise;
  vec3 ramp = smoothstep(vec3(0.0), widths, distances);
  float interior = min(ramp.x, min(ramp.y, ramp.z));
  vec3 sharedNormal = v.rockSmoothNormal / max(length(v.rockSmoothNormal), 0.000001);
  vec3 b = max(v.rockBarycentrics.xyz, vec3(0.0));
  // On AB, the BC and CA terms vanish. At a vertex the shared normal takes
  // over so that every incident face agrees, including at three-way joints.
  vec3 q = b.xyz * b.yzx;
  float sum = q.x + q.y + q.z;
  vec3 edgeNormal = (q.x*v.rockNeighbor0.xyz + q.y*v.rockNeighbor1.xyz + q.z*v.rockNeighbor2.xyz) / max(sum, 0.000001);
  vec3 boundaryNormal = mix(sharedNormal, edgeNormal, min(4.0*sum, 1.0));
  return mix(boundaryNormal, faceNormal, interior);
}
