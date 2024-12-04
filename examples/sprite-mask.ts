/**
 * @title Sprite Mask
 * @category 2D
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*OLkqSKvnD9kAAAAAAAAAAAAADiR2AQ/original
 */
import { OrbitControl } from "@galacean/engine-toolkit-controls";
import {
  AssetType,
  Camera,
  Entity,
  Script,
  Sprite,
  SpriteMask,
  SpriteMaskInteraction,
  SpriteMaskLayer,
  SpriteRenderer,
  Texture2D,
  Vector3,
  WebGLEngine,
} from "@galacean/engine";

// Create engine
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();

  // Create root entity
  const rootEntity = engine.sceneManager.activeScene.createRootEntity();

  // Create camera
  const cameraEntity = rootEntity.createChild("Camera");
  cameraEntity.transform.setPosition(0, 0, 50);
  cameraEntity.addComponent(Camera);
  cameraEntity.addComponent(OrbitControl);

  // Create sprite and mask
  engine.resourceManager
    .load([
      {
        // Sprite texture
        url: "https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*rgNGR4Vb7lQAAAAAAAAAAAAAARQnAQ",
        type: AssetType.Texture2D,
      },
      {
        // Mask texture
        url: "https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*qyhFT5Un5AgAAAAAAAAAAAAAARQnAQ",
        type: AssetType.Texture2D,
      },
      {
        // Mask texture
        url: "https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*pgrpQIneqSUAAAAAAAAAAAAAARQnAQ",
        type: AssetType.Texture2D,
      },
    ])
    .then((textures: Texture2D[]) => {
      const pos = new Vector3();
      const scale = new Vector3();

      // Create sprites.
      const sprite = new Sprite(engine, textures[0]);
      const maskSprite0 = new Sprite(engine, textures[1]);
      const maskSprite1 = new Sprite(engine, textures[2]);

      // Show inside mask.
      pos.set(-5, 0, 0);
      scale.set(2, 2, 2);
      addSpriteRenderer(
        pos,
        scale,
        sprite,
        SpriteMaskInteraction.VisibleInsideMask,
        SpriteMaskLayer.Layer0
      );
      addMask(pos, maskSprite0, SpriteMaskLayer.Layer0, ScaleScript);

      // Show outside mask.
      pos.set(5, 0, 0);
      scale.set(2, 2, 2);
      addSpriteRenderer(
        pos,
        scale,
        sprite,
        SpriteMaskInteraction.VisibleOutsideMask,
        SpriteMaskLayer.Layer1
      );
      addMask(pos, maskSprite1, SpriteMaskLayer.Layer1, RotationScript);
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
    maskLayer: number
  ): void {
    const entity = rootEntity.createChild("Sprite");
    const renderer = entity.addComponent(SpriteRenderer);
    const { transform } = entity;

    transform.position = pos;
    transform.scale = scale;
    renderer.sprite = sprite;
    renderer.maskInteraction = maskInteraction;
    renderer.maskLayer = maskLayer;
  }

  /**
   * Add sprite mask and set influence layers, include mask animation script.
   */
  function addMask<T extends Script>(
    pos: Vector3,
    sprite: Sprite,
    influenceLayers: SpriteMaskLayer,
    scriptType: new (entity: Entity) => T
  ): void {
    const entity = rootEntity.createChild("Mask");
    const mask = entity.addComponent(SpriteMask);

    entity.addComponent(scriptType);
    entity.transform.position = pos;
    mask.sprite = sprite;
    mask.influenceLayers = influenceLayers;
  }

  class ScaleScript extends Script {
    private _scaleSpeed: number = 0.01;

    /**
     * The main loop, called frame by frame.
     * @param deltaTime - The deltaTime when the script update.
     */
    onUpdate(deltaTime: number): void {
      const { transform } = this.entity;
      let curScale = transform.scale.x;

      if (curScale <= 0 || curScale >= 2) {
        this._scaleSpeed *= -1;
      }

      curScale += this._scaleSpeed;
      transform.setScale(curScale, curScale, curScale);
    }
  }

  class RotationScript extends Script {
    private _rotationSpeed: number = -0.5;

    /**
     * The main loop, called frame by frame.
     * @param deltaTime - The deltaTime when the script update.
     */
    onUpdate(deltaTime: number): void {
      this.entity.transform.rotate(0, 0, this._rotationSpeed);
    }
  }
});
