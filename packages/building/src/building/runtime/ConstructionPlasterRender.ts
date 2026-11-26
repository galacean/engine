import { withBuildingWallUVs } from "./BuildingWallGeometryUV";
import { isWallBakeSurface, type BuildingWallBakeBindings } from "./BuildingWallBakeBinding";
import { plasterLinearColor } from "./ConstructionPlasterPalette";
import { masonryTintGLSL } from "./MasonryAppearance";
import { constructionPlasterWarpGLSL } from "./ConstructionPlasterWarp";
import { uvCount, uvU, uvV, type ConstructionPreviewPart, type PackedUv2 } from "./ConstructionPreview";
import type { ConstructionRenderResult } from "./ConstructionDecorationRender";
import { constructionPlasterGLSL, constructionPlasterFinishGLSL } from "./ConstructionPlasterShader";
const program = {
  vert: {
    source: `#version 300 es
precision highp float;
layout(location=0) in vec3 plasterPosition;
layout(location=1) in vec3 plasterNormal;
layout(location=2) in vec3 plasterColor;
layout(location=3) in vec2 plasterUV;
layout(location=4) in vec4 plasterParams;
uniform mat4 renderer_ModelMat;
uniform mat4 renderer_NormalMat;
out vec3 plasterPositionWS;
out vec3 vertexNormal;
out vec3 vertexColor;
out vec2 finishUV;
out vec4 finishParams;
${constructionPlasterWarpGLSL}
void original_main(){vertexNormal=mat3(renderer_NormalMat)*plasterNormal;vertexColor=plasterColor;
finishUV=plasterUV;finishParams=plasterParams;vec3 warped=masonryPlasterWarp(plasterPosition);
plasterPositionWS=(renderer_ModelMat*vec4(warped,1)).xyz;
gl_Position=renderer_MVPMat*vec4(warped,1);}
void main(){original_main();}`
  },
  frag: {
    source: `#version 300 es
precision highp float;
in vec3 plasterPositionWS;
in vec3 vertexNormal;
in vec3 vertexColor;
in vec2 finishUV;
in vec4 finishParams;
layout(location=0) out vec4 residentColor;
${constructionPlasterGLSL}
${constructionPlasterFinishGLSL}
${masonryTintGLSL}
void original_main(){vec3 finish=plasterSurface(finishUV,finishParams.x,finishParams.y,finishParams.w);
vec3 n=normalize(vertexNormal);
vec3 albedo=plasterFinish(finishUV,finishParams,vertexColor,finish,plasterPositionWS,n);
if(finish.x<.5)discard;
vec4 tint=masonryMaterialOverride(0.0);if(tint.a>.5)albedo=vec3(dot(albedo,vec3(.2126,.7152,.0722)))*tint.rgb;
vec3 v=masonrySceneFog(masonryResidentSceneLight(albedo,n,plasterPositionWS,.9),plasterPositionWS);
residentColor=vec4(mix(12.92*v,1.055*pow(v,vec3(1.0/2.4))-.055,greaterThan(v,vec3(.0031308))),1.0);
}
void main(){original_main();}`
  }
};
/** Single shared wall skin source for all LODs. No readback, new captured source,
 * or hidden-region reinterpretation: exact preview polygons reach both paths. */
export function appendPlasterRenderPackage(
  base: ConstructionRenderResult,
  parts: readonly ConstructionPreviewPart[],
  wallBakes?: BuildingWallBakeBindings
): ConstructionRenderResult {
  const files = new Map<string, ArrayBuffer>(),
    draws = base.package.draws.slice();
  for (const [index, source] of parts.entries()) {
    if (!source.plaster || !source.indices.length) continue;
    const binding = isWallBakeSurface(source) && wallBakes?.get(source.owner);
    const p: ConstructionPreviewPart & { lightmapUVs?: Float32Array } = binding
      ? withBuildingWallUVs(source, binding)
      : source;
    const plaster = p.plaster!;
    const count = p.positions.length / 3;
    const pUvs = p.uvs as unknown as PackedUv2;
    if (
      !p.normals ||
      p.normals.length !== p.positions.length ||
      uvCount(pUvs) !== count ||
      plaster.edgeDistances.length !== count
    )
      throw Error("Incomplete plaster geometry");
    const data = new Float32Array(count * 15),
      color = plasterLinearColor(p.color!);
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const off = i * 15;
      data[off] = p.positions[i3]!;
      data[off + 1] = p.positions[i3 + 1]!;
      data[off + 2] = p.positions[i3 + 2]!;
      data[off + 3] = p.normals[i3]!;
      data[off + 4] = p.normals[i3 + 1]!;
      data[off + 5] = p.normals[i3 + 2]!;
      data[off + 6] = color[0]!;
      data[off + 7] = color[1]!;
      data[off + 8] = color[2]!;
      data[off + 9] = uvU(pUvs, i);
      data[off + 10] = uvV(pUvs, i);
      data[off + 11] = plaster.wear;
      data[off + 12] = plaster.wallLength;
      data[off + 13] = plaster.color;
      data[off + 14] = plaster.edgeDistances[i]!;
    }
    const id = `plaster/${encodeURIComponent(p.owner)}/${index}`,
      vertexFile = `dynamic/${id}/vertices.bin`,
      indexFile = `dynamic/${id}/indices.bin`;
    const lightmapFile = `dynamic/${id}/lightmap-uv.bin`;
    if (p.lightmapUVs) files.set(lightmapFile, p.lightmapUVs.buffer as ArrayBuffer);
    files.set(vertexFile, data.buffer);
    files.set(indexFile, (count <= 65535 ? new Uint16Array(p.indices) : new Uint32Array(p.indices)).buffer);
    draws.push({
      id,
      ownerId: p.owner,
      family: "plaster",
      wallBakeReceiver: !!p.lightmapUVs,
      program: "host-plaster",
      count: 1,
      indexCount: p.indices.length,
      indices: indexFile,
      attributes: [
        ...(p.lightmapUVs ? [{ location: 13, size: 2, stride: 8, offset: 0, file: lightmapFile }] : []),
        { location: 0, size: 3, stride: 60, offset: 0, file: vertexFile },
        { location: 1, size: 3, stride: 60, offset: 12, file: vertexFile },
        { location: 2, size: 3, stride: 60, offset: 24, file: vertexFile },
        { location: 3, size: 2, stride: 60, offset: 36, file: vertexFile },
        { location: 4, size: 4, stride: 60, offset: 44, file: vertexFile }
      ],
      resources: {
        material_PlasterColors: { kind: "texture", texture: "plaster_colors", array: true },
        material_PlasterMortar: { kind: "texture", texture: "mortar", array: false }
      },
      instance_buffer: null,
      variant: null,
      group: null
    });
  }
  return {
    package: {
      ...base.package,
      programs: { ...base.package.programs, "host-plaster": program },
      draws
    },
    dynamicFiles: [...base.dynamicFiles, ...files.keys()],
    asset: async (name) => files.get(name)?.slice(0) ?? base.asset(name)
  };
}
