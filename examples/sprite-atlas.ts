/**
 * @title Sprite Atlas
 * @category 2D
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*NLhMT5aeKt4AAAAAAAAAAAAADiR2AQ/original
 */
import {
  AssetType,
  Camera,
  Sprite,
  SpriteAtlas,
  SpriteRenderer,
  Vector3,
  WebGLEngine,
} from "@galacean/engine";

// Create engine
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();

  // Create root entity.
  const rootEntity = engine.sceneManager.activeScene.createRootEntity();

  // Create camera.
  const cameraEntity = rootEntity.createChild("Camera");
  cameraEntity.transform.setPosition(0, 0, 4);
  cameraEntity.addComponent(Camera).isOrthographic = true;

  engine.resourceManager
    .load<SpriteAtlas>({
      url: "https://gw.alipayobjects.com/os/bmw-prod/da0bccd4-020a-41d5-82e0-a04f4413d9a6.atlas",
      type: AssetType.SpriteAtlas,
    })
    .then((atlas) => {
      const from = new Vector3();
      const to = new Vector3();
      // Draw the fence.
      let sprite = atlas.getSprite("terrains-5");
      addGroupSpriteRenderer(sprite, from.set(-6, -6, 0), to.set(6, -6, 0));
      addGroupSpriteRenderer(sprite, from.set(-6, 6, 0), to.set(6, 6, 0));
      addGroupSpriteRenderer(sprite, from.set(-6, -5, 0), to.set(-6, 5, 0));
      addGroupSpriteRenderer(sprite, from.set(6, -5, 0), to.set(6, 5, 0));

      // Draw the walls.
      sprite = atlas.getSprite("terrains-3");
      addGroupSpriteRenderer(sprite, from.set(-5, -2, 0), to.set(-5, 5, 0));
      addGroupSpriteRenderer(sprite, from.set(-4, -3, 0), to.set(-4, -1, 0));
      addSpriteRenderer(sprite, from.set(-3, -2, 0));
      addGroupSpriteRenderer(sprite, from.set(-2, -3, 0), to.set(-2, -2, 0));
      addGroupSpriteRenderer(sprite, from.set(-1, -2, 0), to.set(-1, 5, 0));
      addGroupSpriteRenderer(sprite, from.set(5, -2, 0), to.set(5, 5, 0));
      addGroupSpriteRenderer(sprite, from.set(4, -3, 0), to.set(4, -1, 0));
      addSpriteRenderer(sprite, from.set(3, -2, 0));
      addGroupSpriteRenderer(sprite, from.set(2, -3, 0), to.set(2, -2, 0));
      addGroupSpriteRenderer(sprite, from.set(1, -2, 0), to.set(1, 5, 0));

      // Draw the ground.
      sprite = atlas.getSprite("terrains-0");
      addGroupSpriteRenderer(sprite, from.set(0, -5, 0), to.set(0, 5, 0));
      addGroupSpriteRenderer(sprite, from.set(-1, -3, 0), to.set(1, -3, 0));

      // Draw the magma.
      sprite = atlas.getSprite("terrains-45");
      addGroupSpriteRenderer(sprite, from.set(-5, -5, 0), to.set(-1, -4, 0));
      addGroupSpriteRenderer(sprite, from.set(-4, -3, 0), to.set(-4, -3, 0));
      addSpriteRenderer(sprite, from.set(-5, -3, 0));
      addSpriteRenderer(sprite, from.set(-3, -3, 0));
      addGroupSpriteRenderer(sprite, from.set(1, -5, 0), to.set(5, -4, 0));
      addGroupSpriteRenderer(sprite, from.set(4, -3, 0), to.set(4, -3, 0));
      addSpriteRenderer(sprite, from.set(5, -3, 0));
      addSpriteRenderer(sprite, from.set(3, -3, 0));

      // Draw the river.
      sprite = atlas.getSprite("terrains-46");
      addGroupSpriteRenderer(sprite, from.set(-4, 0, 0), to.set(-2, 5, 0));
      addGroupSpriteRenderer(sprite, from.set(-3, -1, 0), to.set(-2, -1, 0));
      addGroupSpriteRenderer(sprite, from.set(2, 0, 0), to.set(4, 5, 0));
      addGroupSpriteRenderer(sprite, from.set(2, -1, 0), to.set(3, -1, 0));

      // Draw the npcs.
      addSpriteRenderer(atlas.getSprite("npcs-0"), from.set(0, -4, 1));
      addSpriteRenderer(atlas.getSprite("npcs-7"), from.set(-1, -3, 1));
    });

  /**
   * Draw a set of items.
   * @param spriteName - The name of the sprite resource used for drawing
   * @param from  - Starting point of drawing
   * @param to - End point of drawing
   */
  function addGroupSpriteRenderer(
    sprite: Sprite,
    from: Vector3,
    to: Vector3
  ): void {
    const { x: fromX, y: fromY } = from;
    const { x: toX, y: toY } = to;
    for (let i = fromX, n = toX; i <= n; i++) {
      for (let j = fromY, m = toY; j <= m; j++) {
        addSpriteRenderer(sprite, from.set(i, j, 0));
      }
    }
  }

  /**
   * Draw an item.
   * @param spriteName - The name of the sprite resource used for drawing
   * @param position - Position of drawing
   */
  function addSpriteRenderer(sprite: Sprite, position: Vector3): void {
    const spriteEntity = rootEntity.createChild();
    spriteEntity.transform.position = position;
    spriteEntity.transform.scale.set(100 / 32, 100 / 32, 100 / 32);
    spriteEntity.addComponent(SpriteRenderer).sprite = sprite;
  }

  engine.run();
});
