import assert from "node:assert/strict";

export function vertexES3(src) {
  return src.replace(/\battribute\b/g, "in").replace(/\bvarying\b/g, "out");
}
export function fragmentES3(src) {
  src = src.replace(/\bvarying\b/g, "in");
  const outputs = new Set();
  src = src.replace(/\bgl_FragData\s*\[\s*(\d+)\s*\]/g, (_, loc) => {
    outputs.add(loc);
    return "converted_FragData" + loc;
  });
  src =
    [...outputs].map((loc) => "layout(location=" + loc + ") out vec4 converted_FragData" + loc + ";\n").join("") + src;
  if (src.includes("gl_FragColor"))
    src =
      "layout(location=0) out vec4 converted_FragColor;\n" + src.replace(/\bgl_FragColor\b/g, "converted_FragColor");
  return src;
}
export function textureES3(src) {
  return src
    .replace(/\btexture(?:2D|Cube)Lod(?:EXT)?\b/g, "textureLod")
    .replace(/\btexture(?:2D|Cube)Grad(?:EXT)?\b/g, "textureGrad")
    .replace(/\btexture(?:2D|Cube)\b/g, "texture");
}
export function nativeBuilding(src, isVertex, engineShaderSource, lighting) {
  if (isVertex)
    src = src
      .replace(/gl_Position = (.+) \* current_view\.world_to_sample;/g, "gl_Position = renderer_MVPMat * $1;")
      .replace("gl_Position.z=gl_Position.z*2.0-gl_Position.w;", "");
  let result = engineShaderSource(src, "webgpu").source;
  if (!isVertex && /masonryResidentSceneLight\s*\(/.test(result)) {
    if (/uniform\b[^;]*\bcamera_ProjectionParams\b/.test(lighting))
      result = result.replace(/uniform\s+(?:(?:lowp|mediump|highp)\s+)?vec4\s+camera_ProjectionParams\s*;/g, "");
    result = lighting + "\n" + result;
  }
  if (/\bcamera_Position\b/.test(result) && !/\bvec3\s+camera_Position\b/.test(result))
    result = "uniform vec3 camera_Position;\n" + result;
  const matrices = [];
  result = result.replace(
    /(?:layout\s*\([^)]*\)\s*)?flat\s+(in|out)\s+mat([234])\s+(\w+)\s*;/g,
    (_, direction, n, name) => {
      const count = Number(n);
      matrices.push({ count, name });
      return (
        "mat" +
        n +
        " " +
        name +
        ";\n" +
        Array.from({ length: count }, (_, i) => "flat " + direction + " vec" + n + " " + name + "_col" + i + ";").join(
          "\n"
        )
      );
    }
  );
  if (matrices.length) {
    assert.match(result, /void main\s*\(/);
    result = result.replace(/void main\s*\(/, "void native_matrix_main(");
    const copies = matrices
      .flatMap(({ count, name }) =>
        Array.from({ length: count }, (_, i) =>
          isVertex ? name + "_col" + i + "=" + name + "[" + i + "];" : name + "[" + i + "]=" + name + "_col" + i + ";"
        )
      )
      .join("\n");
    result += "\nvoid main(){" + (isVertex ? "native_matrix_main();" + copies : copies + "native_matrix_main();") + "}";
  }
  return isVertex && /\brenderer_MVPMat\b/.test(result) && !/uniform\s+(?:highp\s+)?mat4\s+renderer_MVPMat/.test(result)
    ? "uniform mat4 renderer_MVPMat;\n" + result
    : result;
}
