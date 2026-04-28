/**
 * @title Sprite Mask
 * @category 2D
 */
import {
  AssetType,
  Camera,
  Sprite,
  SpriteMask,
  SpriteMaskInteraction,
  SpriteMaskLayer,
  SpriteRenderer,
  Texture2D,
  WebGLEngine
} from "@galacean/engine";

WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  scene.background.solidColor.set(0.05, 0.05, 0.07, 1);
  const root = scene.createRootEntity("Root");

  const cameraEntity = root.createChild("Camera");
  cameraEntity.transform.setPosition(0, 0, 50);
  cameraEntity.addComponent(Camera);

  engine.resourceManager
    .load<Texture2D>({
      url: "https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*ApFPTZSqcMkAAAAAAAAAAAAAARQnAQ",
      type: AssetType.Texture2D
    })
    .then((texture) => {
      const sprite = new Sprite(engine, texture);
      const maskSprite = new Sprite(engine, createSolidTexture(engine));

      const spriteWidth = sprite.width;
      const spriteHeight = sprite.height;
      // Mask covers ~half of the sprite so the cut is obvious.
      const maskWidth = spriteWidth * 0.6;
      const maskHeight = spriteHeight * 0.6;
      // Lay the two characters out side by side based on sprite size.
      const groupOffsetX = spriteWidth * 0.6;

      // --- Left: VisibleInsideMask -> only the part covered by the square mask is visible ---
      const leftGroup = root.createChild("LeftGroup");
      leftGroup.transform.setPosition(-groupOffsetX, 0, 0);

      const leftMaskEntity = leftGroup.createChild("Mask");
      const leftMask = leftMaskEntity.addComponent(SpriteMask);
      leftMask.sprite = maskSprite;
      leftMask.width = maskWidth;
      leftMask.height = maskHeight;
      leftMask.influenceLayers = SpriteMaskLayer.Layer0;

      const leftSpriteEntity = leftGroup.createChild("Sprite");
      const leftSprite = leftSpriteEntity.addComponent(SpriteRenderer);
      leftSprite.sprite = sprite;
      leftSprite.maskInteraction = SpriteMaskInteraction.VisibleInsideMask;
      leftSprite.maskLayer = SpriteMaskLayer.Layer0;

      // --- Right: VisibleOutsideMask -> character with a square hole punched out ---
      const rightGroup = root.createChild("RightGroup");
      rightGroup.transform.setPosition(groupOffsetX, 0, 0);

      const rightMaskEntity = rightGroup.createChild("Mask");
      const rightMask = rightMaskEntity.addComponent(SpriteMask);
      rightMask.sprite = maskSprite;
      rightMask.width = maskWidth;
      rightMask.height = maskHeight;
      rightMask.influenceLayers = SpriteMaskLayer.Layer1;

      const rightSpriteEntity = rightGroup.createChild("Sprite");
      const rightSprite = rightSpriteEntity.addComponent(SpriteRenderer);
      rightSprite.sprite = sprite;
      rightSprite.maskInteraction = SpriteMaskInteraction.VisibleOutsideMask;
      rightSprite.maskLayer = SpriteMaskLayer.Layer1;
    });

  engine.run();
});

function createSolidTexture(engine: WebGLEngine): Texture2D {
  const texture = new Texture2D(engine, 1, 1);
  texture.setPixelBuffer(new Uint8Array([255, 255, 255, 255]));
  return texture;
}
