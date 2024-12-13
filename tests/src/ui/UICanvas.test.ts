import {
  Sprite,
  SpriteDrawMode,
  SpriteMaskInteraction,
  SpriteMaskLayer,
  SpriteRenderer,
  SpriteTileMode,
  Texture2D,
  TextureFormat
} from "@galacean/engine-core";
import { Color, Rect, Vector2, Vector3, Vector4 } from "@galacean/engine-math";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { describe, beforeEach, expect, it } from "vitest";

describe("UICanvas", async () => {
  const canvas = document.createElement("canvas");
  const engine = await WebGLEngine.create({ canvas: canvas });
  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity("root");

  engine.run();

  beforeEach(() => {
    scene.createRootEntity("root");
  });

  it("Constructor", () => {
    const rootEntity = scene.getRootEntity();
    const spriteRenderer = rootEntity.addComponent(SpriteRenderer);
    const defaultColor = new Color(1, 1, 1, 1);

    expect(spriteRenderer instanceof SpriteRenderer).to.eq(true);
    expect(spriteRenderer.sprite).to.eq(null);
    expect(Color.equals(spriteRenderer.color, defaultColor)).to.eq(true);
    expect(spriteRenderer.flipX).to.eq(false);
    expect(spriteRenderer.flipY).to.eq(false);
  });
});
