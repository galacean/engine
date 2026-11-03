// RiverDemo (Stylized Water 2, Staggart Creations) adaptation.
// See assets/river/SOURCE.md. Travel-time coordinates preserve downstream transport
// through bends and changes in width/speed; the cross coordinate spans one river width.
float riverSlopeMask(vec3 normalWS) {
  float angle = acos(clamp(normalize(normalWS).y * 2.0 - 1.0, -1.0, 1.0)) * 57.2957795;
  return clamp((2.0 * 40.2 - 90.0 - angle) / (40.2 - 90.0), 0.0, 1.0);
}

vec2 riverSourceUv(vec2 motion, float halfWidth) {
  return vec2(0.5 + motion.x / max(halfWidth * 2.0, 0.001), motion.y * 0.25);
}

vec4 riverPackedUv(vec2 uv, vec2 tiling, vec2 offsets) {
  return vec4(uv * tiling, uv * tiling * 0.5) + vec4(0.0, offsets.x, 0.0, offsets.y);
}

vec3 riverUnpackNormal(vec2 packedNormal) {
  vec2 xy = packedNormal * 2.0 - 1.0;
  return vec3(xy, sqrt(max(1.0 - dot(xy, xy), 0.0)));
}

vec3 riverBlendNormals(vec3 a, vec3 b) {
  // Reoriented normal mapping, as used by the reference's advanced shading.
  a.z += 1.0;
  b.xy = -b.xy;
  return a * dot(a, b) / max(a.z, 0.001) - b;
}

vec3 evaluateRiverFlowNormalWS(vec2 motion, float halfWidth, float localSpeed, vec2 flow, vec3 geometryNormal) {
#ifdef MATERIAL_RIVER_FLOW_NORMAL
  float slope = riverSlopeMask(geometryNormal);
  float gate = step(0.0001, localSpeed);
  vec2 uv = riverSourceUv(motion, halfWidth);
  vec2 tiling = vec2(2.0, 1.0) * (1.2 / max(material_SurfaceLengthScale, 0.5));
  vec4 regularUv = riverPackedUv(uv, tiling, material_FlowNormalOffsets.xy * gate);
  vec3 regular = riverBlendNormals(
    riverUnpackNormal(texture2D(material_SurfaceNormalTexture, regularUv.xy).rg),
    riverUnpackNormal(texture2D(material_SurfaceNormalTexture, regularUv.zw).rg));
  // Scale only the spatial primary y; the final time rate already includes this half.
  vec4 slopeUv = vec4(uv * tiling * vec2(1.0, 0.5), uv * tiling * 0.5);
  slopeUv.yw += material_FlowNormalOffsets.xx * gate;
  vec3 steep = riverBlendNormals(
    riverUnpackNormal(texture2D(material_SurfaceNormalTexture, slopeUv.xy).ba),
    riverUnpackNormal(texture2D(material_SurfaceNormalTexture, slopeUv.zw).ba));
  vec3 detail = mix(regular, steep, slope);
  detail = normalize(mix(vec3(0.0, 0.0, 1.0), detail,
    material_FlowNormalStrength * material_MicroSurfaceEnabled));
  vec3 downstream = safeNormalize3(vec3(flow.x, 0.0, flow.y)
    - geometryNormal * dot(vec3(flow.x, 0.0, flow.y), geometryNormal), vec3(0.0, 0.0, 1.0));
  vec3 across = safeNormalize3(cross(downstream, geometryNormal), vec3(1.0, 0.0, 0.0));
  return safeNormalize3(geometryNormal * detail.z + across * detail.x + downstream * detail.y, geometryNormal);
#else
  return safeNormalize3(geometryNormal, geometryNormal);
#endif
}
