import { Color, Vector2, Vector3 } from "@oasis-engine/math";
import { Camera } from "../Camera";
import { Component } from "../Component";
import { Layer } from "../Layer";
import { RenderQueueType } from "../material/enums/RenderQueueType";
import { Material } from "../material/Material";
import { Renderer } from "../Renderer";
import { Shader } from "../shader";
import { ShaderMacroCollection } from "../shader/ShaderMacroCollection";
import { Texture2D } from "../texture";
import { RenderElement } from "./RenderElement";
import { SpriteBatcher } from "./SpriteBatcher";

interface SpriteElement {
  component: Renderer;
  vertices;
  uv;
  triangles;
  color;
  texture;
  camera;
}

type Item = RenderElement | SpriteElement;

/**
 * Render collection.
 * @private
 */
export class RenderQueue {
  readonly items: Item[] = [];

  // TODO
  private _spriteBatcher: SpriteBatcher = null;

  /**
   * Push a render element.
   */
  pushPrimitive(element: RenderElement): void {
    this.items.push(element);
  }

  /**
   * Sort the elements.
   */
  sort(cameraPosition: Vector3): void {
    this.items.sort((a: Item, b: Item) => {
      const aIsPrimitive = this._isPrimitive(a);
      const bIsPrimitive = this._isPrimitive(b);

      if (aIsPrimitive && bIsPrimitive) {
        const aElement: RenderElement = <RenderElement>a;
        const bElement: RenderElement = <RenderElement>b;
        const aRenderQueue = aElement.material.renderQueueType;
        const bRenderQueue = bElement.material.renderQueueType;

        if (aRenderQueue > bRenderQueue) {
          return 1;
        }
        if (aRenderQueue < bRenderQueue) {
          return -1;
        }

        // sort transparent queue from back to front.
        if (aRenderQueue >= RenderQueueType.Transparent && bRenderQueue >= RenderQueueType.Transparent) {
          const aDistance = Vector3.distanceSquared(aElement.component.entity.transform.worldPosition, cameraPosition);
          const bDistance = Vector3.distanceSquared(bElement.component.entity.transform.worldPosition, cameraPosition);

          return bDistance - aDistance;
        }

        // reduce switching shaderProgram
        return aElement.material.shader.name.localeCompare(bElement.material.shader.name);
      } else if (aIsPrimitive && !bIsPrimitive) {
        return -1;
      } else if (!aIsPrimitive && bIsPrimitive) {
        return 1;
      }
    });
  }

  pushSprite(
    component: Component,
    vertices: Vector3[],
    uv: Vector2[],
    triangles: number[],
    color: Color,
    texture: Texture2D,
    camera: Camera
  ) {
    const element: SpriteElement = {
      // @ts-ignore
      component,
      vertices,
      uv,
      triangles,
      color,
      texture,
      camera
    };
    this.items.push(element);
  }

  render(camera: Camera, replaceMaterial: Material, mask: Layer) {
    const items = this.items;
    if (items.length === 0) {
      return;
    }

    const spriteMaterial = camera._renderPipeline._defaultSpriteMaterial;
    const { engine, scene } = camera;
    const renderCount = engine._renderCount;
    const rhi = engine._hardwareRenderer;
    const sceneData = scene.shaderData;
    const cameraData = camera.shaderData;

    for (let i = 0, n = items.length; i < n; i++) {
      const item = items[i];
      const renderPassFlag = item.component.entity.layer;

      if (!(renderPassFlag & mask)) {
        continue;
      }

      if (this._isPrimitive(item)) {
        this._spriteBatcher && this._spriteBatcher.flush(engine, spriteMaterial);

        const compileMacros = Shader._compileMacros;
        const element = <RenderElement>item;
        const renderer = element.component;
        const material = replaceMaterial ? replaceMaterial : element.material;
        const rendererData = renderer.shaderData;
        const materialData = material.shaderData;

        // @todo: temporary solution
        material._preRender(element);

        // union render global macro and material self macro.
        ShaderMacroCollection.unionCollection(
          renderer._globalShaderMacro,
          materialData._macroCollection,
          compileMacros
        );
        compileMacros.unionCollection(element.primitive._macroCollection); //CM&SS: temporary

        const program = material.shader._getShaderProgram(engine, compileMacros);
        if (!program.isValid) {
          continue;
        }

        const switchProgram = program.bind();
        const switchRenderCount = renderCount !== program._uploadRenderCount;

        if (switchRenderCount) {
          program.groupingOtherUniformBlock();
          program.uploadAll(program.sceneUniformBlock, sceneData);
          program.uploadAll(program.cameraUniformBlock, cameraData);
          program.uploadAll(program.rendererUniformBlock, rendererData);
          program.uploadAll(program.materialUniformBlock, materialData);
          program._uploadCamera = camera;
          program._uploadRenderer = renderer;
          program._uploadMaterial = material;
          program._uploadRenderCount = renderCount;
        } else {
          if (program._uploadCamera !== camera) {
            program.uploadUniforms(program.cameraUniformBlock, cameraData);
            program._uploadCamera = camera;
          }

          if (program._uploadRenderer !== renderer) {
            program.uploadUniforms(program.rendererUniformBlock, rendererData);
            program._uploadRenderer = renderer;
          }

          if (program._uploadMaterial !== material) {
            program.uploadUniforms(program.materialUniformBlock, materialData);
            program._uploadMaterial = material;
          }

          if (switchProgram) {
            program.uploadTextures(program.sceneUniformBlock, sceneData);
            program.uploadTextures(program.cameraUniformBlock, cameraData);
            program.uploadTextures(program.rendererUniformBlock, rendererData);
            program.uploadTextures(program.materialUniformBlock, materialData);
          }
        }

        material.renderState._apply(camera.engine);

        rhi.drawPrimitive(element.primitive, element.subPrimitive, program);
      } else {
        const spirteElement = <SpriteElement>item;
        if (!this._spriteBatcher) {
          this._spriteBatcher = new SpriteBatcher(engine);
        }

        this._spriteBatcher.drawSprite(
          spirteElement.component,
          spriteMaterial,
          spirteElement.vertices,
          spirteElement.uv,
          spirteElement.triangles,
          spirteElement.color,
          spirteElement.texture,
          spirteElement.camera
        );
      }
    }

    this._spriteBatcher && this._spriteBatcher.flush(engine, spriteMaterial);
  }

  /**
   * Clear collection.
   */
  clear(): void {
    this.items.length = 0;
  }

  private _isPrimitive(item) {
    return !!item.primitive;
  }
}
