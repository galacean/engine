Varyings MasonryGlobalProxyShadowVertex(Attributes a) {
 Varyings v;
 v.unused = 0.0;
 #ifdef GLOBAL_PROXY_INSTANCED
  int slot = int(a.TEXCOORD_4.x + 0.5);
  float castShadow = a.TEXCOORD_4.z;
 #else
  int metaCode = int(floor(max(0.0, a.NORMAL.w) * 127.0 + 0.5));
  int slot = metaCode & 63;
  float castShadow = (metaCode >= 64) ? 1.0 : 0.0;
 #endif
 vec4 state = material_ProxyState[clamp(slot, 0, 63)];
 if (state.y < 0.5 || castShadow < 0.5) {
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  return v;
 }
 #ifdef GLOBAL_PROXY_INSTANCED
  vec4 p4 = vec4(a.POSITION, 1.0);
  vec3 positionWS = vec3(dot(a.TEXCOORD_1, p4), dot(a.TEXCOORD_2, p4), dot(a.TEXCOORD_3, p4));
  vec3 c0 = vec3(a.TEXCOORD_1.x, a.TEXCOORD_2.x, a.TEXCOORD_3.x);
  vec3 c1 = vec3(a.TEXCOORD_1.y, a.TEXCOORD_2.y, a.TEXCOORD_3.y);
  vec3 c2 = vec3(a.TEXCOORD_1.z, a.TEXCOORD_2.z, a.TEXCOORD_3.z);
  vec3 normalWS = normalize(
   c0 * (a.NORMAL.x / max(dot(c0, c0), 1e-8)) +
   c1 * (a.NORMAL.y / max(dot(c1, c1), 1e-8)) +
   c2 * (a.NORMAL.z / max(dot(c2, c2), 1e-8))
  );
 #else
  vec3 positionWS = a.POSITION;
  vec3 normalWS = normalize(a.NORMAL.xyz);
 #endif
 positionWS -= scene_LightDirection * scene_ShadowBias.x;
 positionWS += normalWS * ((1.0 - clamp(dot(-scene_LightDirection, normalWS), 0.0, 1.0)) * scene_ShadowBias.y);
 gl_Position = camera_VPMat * vec4(positionWS, 1.0);
 gl_Position.z = max(gl_Position.z, -1.0);
 return v;
}
void MasonryGlobalProxyShadowFragment(Varyings v) {
 #ifdef ENGINE_NO_DEPTH_TEXTURE
  vec4 rgba = fract(gl_FragCoord.z * vec4(1.0, 256.0, 65536.0, 16777216.0));
  gl_FragColor = rgba - rgba.gbaa * vec4(1.0 / 256.0, 1.0 / 256.0, 1.0 / 256.0, 0.0);
 #else
  gl_FragColor = vec4(0.0);
 #endif
}
