import { plasterLinearColor } from "./ConstructionPlasterPalette";
import { masonryTintGLSL } from "./MasonryAppearance";
import { constructionPlasterWarpGLSL } from "./ConstructionPlasterWarp";
import type { ConstructionPreviewPart } from "./ConstructionPreview";
import type { ConstructionRenderResult } from "./ConstructionDecorationRender";
import { constructionPlasterGLSL, constructionPlasterFinishGLSL } from "./ConstructionPlasterShader";
const program = (whiteBase: boolean) => ({
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
${whiteBase ? masonryTintGLSL : ""}
void original_main(){vec3 finish=plasterSurface(finishUV,finishParams.x,finishParams.y,finishParams.w);
vec3 n=normalize(vertexNormal);
vec3 albedo=plasterFinish(finishUV,finishParams,vertexColor,finish,plasterPositionWS,n);
if(finish.x<.5)discard;
${whiteBase ? "vec4 tint=masonryMaterialOverride(0.0);if(tint.a>.5)albedo=vec3(dot(albedo,vec3(.2126,.7152,.0722)))*tint.rgb;" : ""}
vec3 v=masonrySceneFog(masonryResidentSceneLight(albedo,n,plasterPositionWS,.9),plasterPositionWS);
residentColor=vec4(mix(12.92*v,1.055*pow(v,vec3(1.0/2.4))-.055,greaterThan(v,vec3(.0031308))),1.0);
}
void main(){original_main();}`
  }
});
/** Single shared wall skin source for all LODs. No readback, new captured source,
 * or hidden-region reinterpretation: exact preview polygons reach both paths. */
export function appendPlasterRenderPackage(
  base: ConstructionRenderResult,
  parts: readonly ConstructionPreviewPart[]
): ConstructionRenderResult {
  const files = new Map<string, ArrayBuffer>(),
    draws = base.package.draws.slice();
  for (const [index, p] of parts.entries()) {
    if (!p.plaster || !p.indices.length) continue;
    if (
      !p.normals ||
      p.normals.length !== p.positions.length ||
      p.uvs.length !== p.positions.length / 3 ||
      p.plaster.edgeDistances.length !== p.uvs.length
    )
      throw Error("Incomplete plaster geometry");
    const count = p.positions.length / 3,
      data = new Float32Array(count * 15),
      color = plasterLinearColor(p.color!);
    for (let i = 0; i < count; i++) {
      data.set(p.positions.slice(i * 3, i * 3 + 3), i * 15);
      data.set(p.normals.slice(i * 3, i * 3 + 3), i * 15 + 3);
      data.set(color, i * 15 + 6);
      data.set(p.uvs[i], i * 15 + 9);
      data.set([p.plaster.wear, p.plaster.wallLength, p.plaster.color, p.plaster.edgeDistances[i]], i * 15 + 11);
    }
    const id = `plaster/${encodeURIComponent(p.owner)}/${index}`,
      vertexFile = `dynamic/${id}/vertices.bin`,
      indexFile = `dynamic/${id}/indices.bin`;
    files.set(vertexFile, data.buffer);
    files.set(indexFile, new Uint32Array(p.indices).buffer);
    draws.push({
      id,
      ownerId: p.owner,
      family: "plaster",
      program: "host-plaster",
      count: 1,
      indexCount: p.indices.length,
      indices: indexFile,
      attributes: [
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
      programs: { ...base.package.programs, "host-plaster": program(!!base.package.whiteBase) },
      draws
    },
    dynamicFiles: [...base.dynamicFiles, ...files.keys()],
    asset: async (name) => files.get(name)?.slice(0) ?? base.asset(name)
  };
}
