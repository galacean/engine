/**
 * @title SpriteMaskCustomStencil
 * @category SpriteMask
 */

import {
  AssetType,
  Camera,
  CompareFunction,
  Layer,
  Script,
  Sprite,
  SpriteMask,
  SpriteMaskInteraction,
  SpriteRenderer,
  StencilOperation,
  Texture2D,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

// Create engine
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();

  // Create root entity
  const rootEntity = engine.sceneManager.activeScene.createRootEntity();

  // Create camera
  const cameraEntity = rootEntity.createChild("Camera");
  cameraEntity.transform.setPosition(0, 0, 50);
  const camera = cameraEntity.addComponent(Camera);
  camera.cullingMask = Layer.Layer0;

  // Create sprite and mask
  engine.resourceManager
    .load([
      {
        // Sprite texture
        url: "https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*rgNGR4Vb7lQAAAAAAAAAAAAAARQnAQ",
        type: AssetType.Texture2D,
        params: {
          isSRGBColorSpace: true
        }
      },
      {
        // Mask texture
        url: "https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*qyhFT5Un5AgAAAAAAAAAAAAAARQnAQ",
        type: AssetType.Texture2D
      }
    ])
    .then((textures: Texture2D[]) => {
      const pos = new Vector3();
      const scale = new Vector3();

      // Create sprites.
      const sprite = new Sprite(engine, textures[0]);
      const maskSprite = new Sprite(engine, textures[1]);

      // create a sprite renderer, and write stencil
      pos.set(0, 0, 0);
      scale.set(5, 5, 5);
      const writeStencilSR = addSpriteRenderer(
        pos,
        scale,
        sprite,
        SpriteMaskInteraction.None,
        Layer.Layer0,
        Layer.Layer0,
        0
      );
      const writeStencilMaterial = writeStencilSR.getInstanceMaterial();
      const writeStencilState = writeStencilMaterial.renderState.stencilState;
      writeStencilState.enabled = true;
      writeStencilState.writeMask = 0xff;
      writeStencilState.passOperationFront = StencilOperation.IncrementSaturate;

      // create a sprite renderer, mask interaction is none, and read stencil
      pos.set(3, 3, 0);
      const readStencilSR = addSpriteRenderer(
        pos,
        scale,
        sprite,
        SpriteMaskInteraction.None,
        Layer.Layer0,
        Layer.Layer0,
        1
      );
      readStencilSR.color.set(1, 0, 0, 1);
      const readStencilMaterial = readStencilSR.getInstanceMaterial();
      const readStencilState = readStencilMaterial.renderState.stencilState;
      readStencilState.enabled = true;
      readStencilState.referenceValue = 1;
      readStencilState.compareFunctionFront = CompareFunction.LessEqual;
      readStencilState.compareFunctionBack = CompareFunction.LessEqual;

      // create a sprite renderer, mask interaction is not none
      pos.set(5, -3, 0);
      const maskSR = addSpriteRenderer(
        pos,
        scale,
        sprite,
        SpriteMaskInteraction.VisibleOutsideMask,
        Layer.Layer0,
        Layer.Layer0,
        2
      );
      maskSR.color.set(0, 1, 0, 1);

      // create a sprite mask
      pos.set(20, 0, 0);
      addMask(pos, maskSprite, Layer.Layer0, Layer.Layer0);

      // create a sprite renderer, and read stencil
      pos.set(20, 10, 0);
      scale.set(3, 3, 3);
      const readStencilSR2 = addSpriteRenderer(
        pos,
        scale,
        sprite,
        SpriteMaskInteraction.None,
        Layer.Layer0,
        Layer.Layer0,
        4
      );
      readStencilSR2.color.set(1, 0.5, 0.8, 1);
      const readStencilMaterial2 = readStencilSR2.getInstanceMaterial();
      const readStencilState2 = readStencilMaterial2.renderState.stencilState;
      readStencilState2.enabled = true;
      readStencilState2.referenceValue = 1;
      readStencilState2.compareFunctionFront = CompareFunction.Greater;
      readStencilState2.compareFunctionBack = CompareFunction.Greater;

      updateForE2E(engine, 100, 100);
      initScreenshot(engine, camera);
    });

  engine.run();

  /**
   * Add sprite renderer and set mask interaction and layer.
   */
  function addSpriteRenderer(
    pos: Vector3,
    scale: Vector3,
    sprite: Sprite,
    maskInteraction: SpriteMaskInteraction,
    maskLayer: number,
    layer: number,
    priority: number
  ): SpriteRenderer {
    const entity = rootEntity.createChild("Sprite");
    entity.layer = layer;
    const renderer = entity.addComponent(SpriteRenderer);
    const { transform } = entity;

    transform.position = pos;
    transform.scale = scale;
    renderer.sprite = sprite;
    renderer.maskInteraction = maskInteraction;
    renderer.maskLayer = maskLayer;
    renderer.priority = priority;

    return renderer;
  }

  /**
   * Add sprite mask and set influence layers, include mask animation script.
   */
  function addMask<T extends Script>(pos: Vector3, sprite: Sprite, layer: number, influenceLayers: number): void {
    const entity = rootEntity.createChild(`Mask`);
    entity.layer = layer;
    const mask = entity.addComponent(SpriteMask);

    // entity.addComponent(scriptType);
    entity.transform.position = pos;
    mask.sprite = sprite;
    mask.influenceLayers = influenceLayers;
  }
});
