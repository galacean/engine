import { Shader, MeshRenderer, type Material, type Camera } from "@galacean/engine";
import type {
  RuntimePickBatch,
  RuntimePickSource,
  RuntimePickVisitor
} from "@galacean/engine-modify/rendering/runtime-pick-source";
import type { RuntimeSceneInspection } from "./runtime-scene-inspection";

export function meshPickShader(original: Shader): Shader {
  if (original.name.startsWith("RuntimeMeshPick_")) return original;
  const name = `RuntimeMeshPick_${original.name}`;
  const vertexColor =
    original.name === "Unlit"
      ? ""
      : `
              #ifdef RENDERER_ENABLE_VERTEXCOLOR
                alpha *= v.vertexColor.a;
              #endif`;
  return (
    Shader.find(name) ??
    Shader.create(`
    Shader "${name}" {
      SubShader "Default" {
        Pass "Forward" {
          Tags { pipelineStage = "Forward" }
          CullMode rasterStateCullMode;
          CompareFunction material_WorldPickDepthCompare;
          DepthState = { WriteEnabled = true; CompareFunction = material_WorldPickDepthCompare; }
          RasterState = { CullMode = rasterStateCullMode; }
          BlendState = { Enabled = false; }
          VertexShader = PBRVertex;
          FragmentShader = MeshPickFragment;
          #include "ShaderLibrary/PBR/ForwardPassPBR.glsl"
          float renderer_WorldPickBase;
          void MeshPickFragment(Varyings v) {
            // Same animated vertex path and alpha coverage as the visible PBR mesh.
            #ifdef MATERIAL_IS_ALPHA_CUTOFF
              float alpha = material_BaseColor.a;
              #ifdef MATERIAL_HAS_BASETEXTURE
                alpha *= texture2D(material_BaseTexture, v.uv).a;
              #endif
              ${vertexColor}
              if (alpha < material_AlphaCutoff) discard;
            #endif
            float id = floor(renderer_WorldPickBase + 0.5);
            #ifdef RENDERER_WORLD_PICK_DEPTH
              id = floor(gl_FragCoord.z * 16777215.0 + 0.5);
            #endif
            gl_FragColor = vec4(mod(id, 256.0), mod(floor(id / 256.0), 256.0), floor(id / 65536.0), 255.0) / 255.0;
          }
        }
      }
    }
  `)
  );
}

/** Materials belong to the renderer; borrow them only inside the synchronous pick's try/finally. */
class MeshPickBatch implements RuntimePickBatch {
  readonly count = 1;
  private saved: { material: Material; shader: Shader }[] = [];
  constructor(
    readonly renderer: MeshRenderer,
    private readonly id: string
  ) {}
  resolve(): string {
    return this.id;
  }
  prepare(): void {
    for (const material of this.renderer.getMaterials()) {
      if (!material) continue;
      this.saved.push({ material, shader: material.shader });
      material.shader = meshPickShader(material.shader);
    }
  }
  restore(): void {
    for (let i = this.saved.length - 1; i >= 0; i--) this.saved[i]!.material.shader = this.saved[i]!.shader;
    this.saved.length = 0;
  }
}

/** Built-in mesh deformation supports rigid, skinned and blend-shape meshes without domain registration.
 * Custom geometry/coverage and packed instance layouts belong to the draw producer's common port. */
export class RuntimeMeshPickSource {
  private readonly meshes = new WeakMap<MeshRenderer, MeshPickBatch>();
  constructor(
    private readonly camera: Camera,
    private readonly inspection: RuntimeSceneInspection,
    private readonly custom: RuntimePickSource
  ) {}
  visit(visitor: RuntimePickVisitor): void {
    const seen = new Set<MeshRenderer>();
    this.custom((batch) => {
      seen.add(batch.renderer);
      visitor(batch);
    });
    for (const root of this.camera.scene!.rootEntities) {
      for (const renderer of root.getComponentsIncludeChildren(MeshRenderer, [])) {
        if (
          seen.has(renderer) ||
          renderer.destroyed ||
          renderer.pendingDestroy ||
          renderer.entity.pendingDestroy ||
          !renderer.enabled ||
          !renderer.entity.isActiveInHierarchy ||
          !renderer.mesh
        )
          continue;
        // A replacement vertex program must never impersonate an unknown custom deformation.
        if (
          !renderer
            .getMaterials()
            .every((material) => !material || ["PBR", "Unlit", "BlinnPhong"].includes(material.shader.name))
        )
          continue;
        if ("instanceCount" in renderer.mesh && Number(renderer.mesh.instanceCount) > 1) continue;
        let batch = this.meshes.get(renderer);
        if (!batch) {
          batch = new MeshPickBatch(renderer, String(this.inspection.id(renderer)));
          this.meshes.set(renderer, batch);
        }
        visitor(batch);
      }
    }
  }
}
