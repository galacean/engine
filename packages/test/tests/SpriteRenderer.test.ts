import { Color, Entity, SpriteRenderer, DrawMode, Texture2D, Sprite, WebGLEngine } from "oasis-engine";

describe('SpriteRenderer', () => {
  const canvas = document.createElement("canvas");
  const engine = new WebGLEngine(canvas);
  const scene = engine.sceneManager.activeScene;
  
  engine.run();

  beforeEach(() => {
    (Entity as any)._entitys.length = 0;
    (Entity as any)._entitys._elements.length = 0;
    scene.createRootEntity("root");
  });

  it('Constructor', () => {
    const rootEntity = scene.getRootEntity();
    const spriteRenderer = rootEntity.addComponent(SpriteRenderer);
    const defaultColor = new Color(1, 1, 1, 1);

    expect(spriteRenderer instanceof SpriteRenderer).toEqual(true);
    expect(spriteRenderer.drawMode).toEqual(DrawMode.Simple);
    expect(spriteRenderer.sprite).toEqual(null);
    expect(Color.equals(spriteRenderer.color, defaultColor)).toEqual(true);
    expect(spriteRenderer.flipX).toEqual(false);
    expect(spriteRenderer.flipY).toEqual(false);
  });

  it('get set sprite', () => {
    const rootEntity = scene.getRootEntity();
    const spriteRenderer = rootEntity.addComponent(SpriteRenderer);
    const texture = new Texture2D(engine, 100, 100);
    const sprite = new Sprite(engine, texture);
    spriteRenderer.sprite = sprite;

    expect(spriteRenderer.sprite).toBe(sprite);
  });

  it('get set color', () => {
    const rootEntity = scene.getRootEntity();
    const spriteRenderer = rootEntity.addComponent(SpriteRenderer);
    spriteRenderer.color.setValue(1, 0, 0, 1);

    expect(Color.equals(spriteRenderer.color, new Color(1, 0, 0, 1))).toEqual(true);
  });

  it('get set flip', () => {
    const rootEntity = scene.getRootEntity();
    const spriteRenderer = rootEntity.addComponent(SpriteRenderer);
    spriteRenderer.flipX = true;
    spriteRenderer.flipY = true;

    expect(spriteRenderer.flipY).toEqual(true);
    expect(spriteRenderer.flipY).toEqual(true);
  });
});
