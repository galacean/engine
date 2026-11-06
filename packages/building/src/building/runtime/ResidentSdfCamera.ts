/** The recovered brick proxy assumes a perspective eye. Engine cameras also
 * support orthographic projection: face selection, SDF marching and hit depth
 * must all use the same parallel ray in that case. Keep this at the building
 * renderer boundary, without moving the eye or changing brick geometry. */
export function adaptBrickSdfCamera(vertex: string, fragment: string) {
  const replace = (source: string, from: string, to: string) => {
    if (source.split(from).length !== 2) throw Error("Unknown brick SDF camera expression: " + from);
    return source.replace(from, to);
  };
  const helper = `
uniform mat4 camera_ProjMat;
bool masonrySdfOrthographic() { return camera_ProjMat[3][3] != 0.0; }
vec3 masonrySdfTowardCamera(vec3 eye, vec3 point) {
  // Camera local +Z is toward the viewer; view_to_world maps it into the
  // building's local coordinates, including the inverse model transform.
  return masonrySdfOrthographic() ? current_view.view_to_world[2].xyz : eye - point;
}
void original_main()`;
  vertex = replace(
    vertex,
    "(_1445 - (vec4(0.0, 0.0, 0.0, 1.0) * _3052))",
    "masonrySdfTowardCamera(_1445, vec4(0.0, 0.0, 0.0, 1.0) * _3052)"
  );
  vertex = replace(
    vertex,
    "vec3 camera_offset_ws = _1445 - _887;",
    "vec3 camera_offset_ws = masonrySdfTowardCamera(_1445, _887);"
  );
  vertex = replace(
    vertex,
    "v4 = normalize(_1023 - _1029);",
    "v4 = normalize(masonrySdfOrthographic() ? -_1029 : _1023 - _1029);"
  );
  fragment = replace(
    fragment,
    "normalize(v2 - (_1434.xyz / vec3(_1434.w)))",
    "(-normalize(masonrySdfTowardCamera(_1434.xyz / vec3(_1434.w), v2)))"
  );
  return {
    vertex: replace(vertex, "void original_main()", helper),
    fragment: replace(fragment, "void original_main()", helper)
  };
}
