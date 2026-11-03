/** Capture the original vertex producer's final deformed position at its actual
 * projection assignment, avoiding guesses about optimized varying names. Decode
 * its packed normal from the same gbuffer ABI used by the existing display
 * wrapper. Scene lighting consumes the same normal plus packed roughness. Apply BEFORE EngineShaderSource and before the host MVP replacement. */
export function injectConstructionDecorationLighting(
  vertex: string,
  fragment: string
): { vertex: string; fragment: string; injected: boolean } {
  if (vertex.includes("masonryLightingPositionWS") || !fragment.includes("uint c=entryPointParam_ps_main_gbuffer.y;"))
    return { vertex, fragment, injected: false };
  const projection = /gl_Position = (.+) \* current_view\.world_to_sample;/g;
  if (!projection.test(vertex)) return { vertex, fragment, injected: false };
  projection.lastIndex = 0;
  vertex = vertex.replace(
    "void original_main()",
    "uniform mat4 renderer_ModelMat;\nout vec3 masonryLightingPositionWS;\nvoid original_main()"
  );
  vertex = vertex.replace(
    projection,
    (_line, position) =>
      `masonryLightingPositionWS=(renderer_ModelMat * (${position})).xyz;\ngl_Position = ${position} * current_view.world_to_sample;`
  );
  fragment = fragment.replace(
    "void original_main()",
    "\nuniform mat4 renderer_NormalMat;\nin vec3 masonryLightingPositionWS;\nvoid original_main()"
  );
  const marker = "v*=v;";
  if (!fragment.includes(marker)) throw Error("Unknown recovered display color boundary for local lighting");
  // A distance-field proxy has a per-pixel surface hit; lighting at the
  // interpolated box face would slide over bevels as LOD switches.
  const lightingPosition = fragment.includes("vec3 masonrySdfHitLocal;")
    ? "(renderer_ModelMat*vec4(masonrySdfHitLocal,1.0)).xyz"
    : "masonryLightingPositionWS";
  if (lightingPosition !== "masonryLightingPositionWS")
    fragment = fragment.replace("void original_main()", "uniform mat4 renderer_ModelMat;\nvoid original_main()");
  fragment = fragment.replace(
    marker,
    marker +
      `uint masonryPackedNormal=entryPointParam_ps_main_gbuffer.x;vec3 masonryNormal=vec3(masonryPackedNormal&255u,(masonryPackedNormal>>8u)&255u,(masonryPackedNormal>>16u)&255u)/127.5-1.0;vec3 masonryNormalWS=normalize(mat3(renderer_NormalMat)*masonryNormal);vec3 masonryAlbedo=v;v=masonrySceneFog(masonryResidentSceneLight(masonryAlbedo,masonryNormalWS,${lightingPosition},float(masonryPackedNormal>>24u)/255.0),${lightingPosition});`
  );
  return { vertex, fragment, injected: true };
}
