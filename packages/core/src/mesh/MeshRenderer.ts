import { BoundingBox } from "@galacean/engine-math";
import { Logger } from "../base/Logger";
import { ignoreClone } from "../clone/CloneManager";
import { ICustomClone } from "../clone/ComponentCloner";
import { Entity } from "../Entity";
import { Mesh, MeshModifyFlags } from "../graphic/Mesh";
import { Renderer, RendererUpdateFlags } from "../Renderer";
import { RenderContext } from "../RenderPipeline/RenderContext";
import { ShaderMacro } from "../shader/ShaderMacro";

/**
 * MeshRenderer Component.
 */
export class MeshRenderer extends Renderer implements ICustomClone {
  private static _uvMacro = ShaderMacro.getByName("RENDERER_HAS_UV");
  private static _uv1Macro = ShaderMacro.getByName("RENDERER_HAS_UV1");
  private static _normalMacro = ShaderMacro.getByName("RENDERER_HAS_NORMAL");
  private static _tangentMacro = ShaderMacro.getByName("RENDERER_HAS_TANGENT");
  private static _vertexColorMacro = ShaderMacro.getByName("RENDERER_HAS_VERTEXCOLOR");

  /** @internal */
  @ignoreClone
  _mesh: Mesh;

  /**
   * Mesh assigned to the renderer.
   */
  get mesh(): Mesh {
    return this._mesh;
  }

  set mesh(value: Mesh) {
    if (this._mesh !== value) {
      this._setMesh(value);
    }
  }

  /**
   * @internal
   */
  constructor(entity: Entity) {
    super(entity);
    this._onMeshChanged = this._onMeshChanged.bind(this);
  }

  /**
   * @internal
   * @override
   */
  protected _onDestroy(): void {
    super._onDestroy();
    const mesh = this._mesh;
    if (mesh && !mesh.destroyed) {
      mesh._addReferCount(-1);
      this._mesh = null;
    }
  }

  /**
   * @internal
   */
  _cloneTo(target: MeshRenderer): void {
    target.mesh = this._mesh;
  }

  /**
   * @override
   */
  protected _updateBounds(worldBounds: BoundingBox): void {
    const mesh = this._mesh;
    if (mesh) {
      const localBounds = mesh.bounds;
      const worldMatrix = this._entity.transform.worldMatrix;
      BoundingBox.transform(localBounds, worldMatrix, worldBounds);
    } else {
      worldBounds.min.set(0, 0, 0);
      worldBounds.max.set(0, 0, 0);
    }
  }

  /**
   * @override
   */
  protected _render(context: RenderContext): void {
    const mesh = this._mesh;
    if (mesh) {
      if (this._dirtyUpdateFlag & MeshRendererUpdateFlags.VertexElementMacro) {
        const shaderData = this.shaderData;
        const vertexElements = mesh._vertexElements;

        shaderData.disableMacro(MeshRenderer._uvMacro);
        shaderData.disableMacro(MeshRenderer._uv1Macro);
        shaderData.disableMacro(MeshRenderer._normalMacro);
        shaderData.disableMacro(MeshRenderer._tangentMacro);
        shaderData.disableMacro(MeshRenderer._vertexColorMacro);

        for (let i = 0, n = vertexElements.length; i < n; i++) {
          switch (vertexElements[i].semantic) {
            case "TEXCOORD_0":
              shaderData.enableMacro(MeshRenderer._uvMacro);
              break;
            case "TEXCOORD_1":
              shaderData.enableMacro(MeshRenderer._uv1Macro);
              break;
            case "NORMAL":
              shaderData.enableMacro(MeshRenderer._normalMacro);
              break;
            case "TANGENT":
              shaderData.enableMacro(MeshRenderer._tangentMacro);
              break;
            case "COLOR_0":
              shaderData.enableMacro(MeshRenderer._vertexColorMacro);
              break;
          }
        }
        this._dirtyUpdateFlag &= ~MeshRendererUpdateFlags.VertexElementMacro;
      }

      const materials = this._materials;
      const subMeshes = mesh.subMeshes;
      const renderPipeline = context.camera._renderPipeline;
      const meshRenderDataPool = this._engine._meshRenderDataPool;
      for (let i = 0, n = subMeshes.length; i < n; i++) {
        const material = materials[i];
        if (!material) continue;
        const renderData = meshRenderDataPool.getFromPool();
        renderData.set(this, material, mesh, subMeshes[i]);
        renderPipeline.pushRenderData(context, renderData);
      }
    } else {
      Logger.error("mesh is null.");
    }
  }

  private _setMesh(mesh: Mesh): void {
    const lastMesh = this._mesh;
    if (lastMesh) {
      lastMesh._addReferCount(-1);
      lastMesh._updateFlagManager.removeListener(this._onMeshChanged);
    }
    if (mesh) {
      mesh._addReferCount(1);
      mesh._updateFlagManager.addListener(this._onMeshChanged);
      this._dirtyUpdateFlag |= MeshRendererUpdateFlags.All;
    }
    this._mesh = mesh;
  }

  @ignoreClone
  private _onMeshChanged(type: MeshModifyFlags): void {
    type & MeshModifyFlags.Bounds && (this._dirtyUpdateFlag |= RendererUpdateFlags.WorldVolume);
    type & MeshModifyFlags.VertexElements && (this._dirtyUpdateFlag |= MeshRendererUpdateFlags.VertexElementMacro);
  }
}

/**
 * @remarks Extends `RendererUpdateFlag`.
 */
enum MeshRendererUpdateFlags {
  /** VertexElementMacro. */
  VertexElementMacro = 0x2,
  /** All. */
  All = 0x3
}
