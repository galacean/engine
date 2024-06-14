import { BoundingBox } from "@galacean/engine-math";
import { Entity } from "../Entity";
import { RenderContext } from "../RenderPipeline/RenderContext";
import { Renderer, RendererUpdateFlags } from "../Renderer";
import { Logger } from "../base/Logger";
import { ignoreClone } from "../clone/CloneManager";
import { Mesh, MeshModifyFlags } from "../graphic/Mesh";
import { ShaderMacro } from "../shader/ShaderMacro";

/**
 * MeshRenderer Component.
 */
export class MeshRenderer extends Renderer {
  private static _uvMacro = ShaderMacro.getByName("RENDERER_HAS_UV");
  private static _uv1Macro = ShaderMacro.getByName("RENDERER_HAS_UV1");
  private static _normalMacro = ShaderMacro.getByName("RENDERER_HAS_NORMAL");
  private static _tangentMacro = ShaderMacro.getByName("RENDERER_HAS_TANGENT");
  private static _enableVertexColorMacro = ShaderMacro.getByName("RENDERER_ENABLE_VERTEXCOLOR");

  private _enableVertexColor: boolean = false;

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
   * Whether enable vertex color.
   */
  get enableVertexColor(): boolean {
    return this._enableVertexColor;
  }

  set enableVertexColor(value: boolean) {
    if (value !== this._enableVertexColor) {
      this._dirtyUpdateFlag |= MeshRendererUpdateFlags.VertexElementMacro;
      this._enableVertexColor = value;
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
   */
  protected override _onDestroy(): void {
    const mesh = this._mesh;
    if (mesh) {
      mesh.destroyed || this._addResourceReferCount(mesh, -1);
      mesh._updateFlagManager.removeListener(this._onMeshChanged);
      this._mesh = null;
    }

    super._onDestroy();
  }

  /**
   * @internal
   */
  override _cloneTo(target: MeshRenderer, srcRoot: Entity, targetRoot: Entity): void {
    super._cloneTo(target, srcRoot, targetRoot);
    target.mesh = this._mesh;
  }

  /**
   * @internal
   */
  override _prepareRender(context: RenderContext): void {
    if (!this._mesh) {
      Logger.error("mesh is null.");
      return;
    }
    if (this._mesh.destroyed) {
      Logger.error("mesh is destroyed.");
      return;
    }
    super._prepareRender(context);
  }

  /**
   * @internal
   */
  protected override _updateBounds(worldBounds: BoundingBox): void {
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
   * @internal
   */
  protected override _render(context: RenderContext): void {
    const mesh = this._mesh;
    if (this._dirtyUpdateFlag & MeshRendererUpdateFlags.VertexElementMacro) {
      const shaderData = this.shaderData;
      const vertexElements = mesh._primitive.vertexElements;

      shaderData.disableMacro(MeshRenderer._uvMacro);
      shaderData.disableMacro(MeshRenderer._uv1Macro);
      shaderData.disableMacro(MeshRenderer._normalMacro);
      shaderData.disableMacro(MeshRenderer._tangentMacro);
      shaderData.disableMacro(MeshRenderer._enableVertexColorMacro);

      for (let i = 0, n = vertexElements.length; i < n; i++) {
        switch (vertexElements[i].attribute) {
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
            this._enableVertexColor && shaderData.enableMacro(MeshRenderer._enableVertexColorMacro);
            break;
        }
      }
      this._dirtyUpdateFlag &= ~MeshRendererUpdateFlags.VertexElementMacro;
    }

    const { _materials: materials, _engine: engine } = this;
    const subMeshes = mesh.subMeshes;
    const renderData = engine._renderDataPool.get();
    renderData.set(this.priority, this._distanceForSort);
    const subRenderElementPool = engine._subRenderElementPool;
    for (let i = 0, n = subMeshes.length; i < n; i++) {
      let material = materials[i];
      if (!material) {
        continue;
      }
      if (material.destroyed || material.shader.destroyed) {
        material = this.engine._meshMagentaMaterial;
      }

      const subRenderElement = subRenderElementPool.get();
      subRenderElement.set(this, material, mesh._primitive, subMeshes[i]);
      renderData.addSubRenderElement(subRenderElement);
    }
    context.camera._renderPipeline.pushRenderData(context, renderData);
  }

  private _setMesh(mesh: Mesh): void {
    const lastMesh = this._mesh;
    if (lastMesh) {
      this._addResourceReferCount(lastMesh, -1);
      lastMesh._updateFlagManager.removeListener(this._onMeshChanged);
    }
    if (mesh) {
      this._addResourceReferCount(mesh, 1);
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
