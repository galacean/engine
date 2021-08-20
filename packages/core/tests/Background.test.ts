import { WebCanvas, WebGLRenderer } from "../../rhi-webgl";
import { Engine, Texture2D } from "../src";
import { BackgroundTextureFillMode } from "../src/enums/BackgroundTextureFillMode";

describe("Background Test", function () {
  const hardwareRenderer = new WebGLRenderer();
  const canvas = new WebCanvas(document.createElement("canvas"));
  canvas.width = 100;
  canvas.height = 100;
  const engine = new Engine(canvas, hardwareRenderer);
  const scene = engine.sceneManager.activeScene;
  it("set texture should be success", () => {
    const texture = new Texture2D(engine, 50, 100);
    scene.background._resizeBackgroundTexture();
    scene.background.texture = texture;
    expect(scene.background.texture).toEqual(texture)
    scene.background.texture = texture;
    expect(scene.background.texture).toEqual(texture);
    expect(scene.background.textureFillMode).toEqual(BackgroundTextureFillMode.AspectFitHeight);
    scene.background.textureFillMode = BackgroundTextureFillMode.AspectFitHeight;
    expect(scene.background.textureFillMode).toEqual(BackgroundTextureFillMode.AspectFitHeight);
  });
  it("set texture fill should be success", () => {
    scene.background.textureFillMode = BackgroundTextureFillMode.Fill;
    const positions = engine._backgroundTextureMesh.getPositions();
    expect(positions[0].x).toBeCloseTo(-1);
    expect(positions[0].y).toBeCloseTo(-1);

    expect(positions[1].x).toBeCloseTo(1);
    expect(positions[1].y).toBeCloseTo(-1);

    expect(positions[2].x).toBeCloseTo(-1);
    expect(positions[2].y).toBeCloseTo(1);

    expect(positions[3].x).toBeCloseTo(1);
    expect(positions[3].y).toBeCloseTo(1);
  });

  it("set texture fill should be success", () => {
    scene.background.textureFillMode = BackgroundTextureFillMode.AspectFitHeight;
    const positions = engine._backgroundTextureMesh.getPositions();
    expect(positions[0].x).toBeCloseTo(-0.5);
    expect(positions[0].y).toBeCloseTo(-1);

    expect(positions[1].x).toBeCloseTo(0.5);
    expect(positions[1].y).toBeCloseTo(-1);

    expect(positions[2].x).toBeCloseTo(-0.5);
    expect(positions[2].y).toBeCloseTo(1);

    expect(positions[3].x).toBeCloseTo(0.5);
    expect(positions[3].y).toBeCloseTo(1);
  });

  it("set texture fill should be success", () => {
    scene.background.textureFillMode = BackgroundTextureFillMode.AspectFitWidth;
    const positions = engine._backgroundTextureMesh.getPositions();
    expect(positions[0].x).toBeCloseTo(-1);
    expect(positions[0].y).toBeCloseTo(-2);

    expect(positions[1].x).toBeCloseTo(1);
    expect(positions[1].y).toBeCloseTo(-2);

    expect(positions[2].x).toBeCloseTo(-1);
    expect(positions[2].y).toBeCloseTo(2);

    expect(positions[3].x).toBeCloseTo(1);
    expect(positions[3].y).toBeCloseTo(2);
  });
});
