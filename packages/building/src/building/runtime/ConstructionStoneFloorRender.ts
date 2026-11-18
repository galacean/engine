import type { ConstructionPreviewPart } from "./ConstructionPreview";
import type { ConstructionRenderResult } from "./ConstructionDecorationRender";
import { stoneFloorTextureBindings } from "./ConstructionStoneFloorAssets";
import { constructionStoneFloorGLSL } from "./ConstructionStoneFloorShader";
const program = {
  vert: {
    source: `#version 300 es
precision highp float;
layout(location=0) in vec3 floorPosition;
layout(location=1) in vec2 floorUV;
layout(location=2) in vec4 floorTransform;
layout(location=3) in float floorColor;
uniform mat4 renderer_ModelMat;
uniform mat4 renderer_NormalMat;
out vec3 floorPositionWS;
out vec3 floorNormalWS;
out vec2 floorChart;
out vec4 floorMapping;
out float floorPalette;
void original_main() {
 floorPositionWS=(renderer_ModelMat*vec4(floorPosition,1)).xyz;
 floorNormalWS=normalize(mat3(renderer_NormalMat)*vec3(0,1,0));
 floorChart=floorUV;floorMapping=floorTransform;floorPalette=floorColor;
 gl_Position=renderer_MVPMat*vec4(floorPosition,1);
}
void main(){original_main();}`
  },
  frag: {
    source: `#version 300 es
precision highp float;
precision highp int;
in vec3 floorPositionWS;
in vec3 floorNormalWS;
in vec2 floorChart;
in vec4 floorMapping;
in float floorPalette;
layout(location=0) out vec4 residentColor;
${constructionStoneFloorGLSL}
void original_main() {
 vec3 normal=normalize(floorNormalWS);float roughness;
 vec3 albedo=stoneFloorFinish(floorChart,floorMapping,floorPalette,floorPositionWS,camera_Position,normal,roughness);
 vec3 v=masonrySceneFog(masonryResidentSceneLight(albedo,normal,floorPositionWS,roughness),floorPositionWS);
 residentColor=vec4(mix(12.92*v,1.055*pow(v,vec3(1.0/2.4))-.055,greaterThan(v,vec3(.0031308))),1.0);
}
void main(){original_main();}`
  }
};
export function appendStoneFloorRenderPackage(
  base: ConstructionRenderResult,
  parts: readonly ConstructionPreviewPart[]
): ConstructionRenderResult {
  const files = new Map<string, ArrayBuffer>(),
    draws = base.package.draws.slice();
  for (const [index, part] of parts.entries()) {
    if (!part.stonePaving || !part.indices.length) continue;
    const count = part.positions.length / 3,
      data = new Float32Array(count * 10);
    if (part.uvs.length !== count) throw Error("Stone floor requires its original metric UV chart");
    for (let i = 0; i < count; i++) {
      data.set(part.positions.slice(i * 3, i * 3 + 3), i * 10);
      data.set(part.uvs[i], i * 10 + 3);
      data.set(part.stonePaving.uvTransform, i * 10 + 5);
      data[i * 10 + 9] = part.stonePaving.color;
    }
    const id = `stone-floor/${encodeURIComponent(part.owner)}/${index}`,
      vertexFile = `dynamic/${id}/vertices.bin`,
      indexFile = `dynamic/${id}/indices.bin`;
    files.set(vertexFile, data.buffer);
    files.set(indexFile, new Uint32Array(part.indices).buffer);
    draws.push({
      id,
      ownerId: part.owner,
      family: "stone-floor",
      program: "host-stone-floor",
      count: 1,
      indexCount: part.indices.length,
      indices: indexFile,
      attributes: [
        { location: 0, size: 3, stride: 40, offset: 0, file: vertexFile },
        { location: 1, size: 2, stride: 40, offset: 12, file: vertexFile },
        { location: 2, size: 4, stride: 40, offset: 20, file: vertexFile },
        { location: 3, size: 1, stride: 40, offset: 36, file: vertexFile }
      ],
      resources: Object.fromEntries(
        stoneFloorTextureBindings.map(([uniform, texture, array]) => [
          uniform,
          { kind: "texture" as const, texture, array }
        ])
      ),
      instance_buffer: null,
      variant: null,
      group: null
    });
  }
  return {
    package: { ...base.package, programs: { ...base.package.programs, "host-stone-floor": program }, draws },
    dynamicFiles: [...base.dynamicFiles, ...files.keys()],
    asset: async (name) => files.get(name)?.slice(0) ?? base.asset(name)
  };
}
