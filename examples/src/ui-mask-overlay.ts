/**
 * @title UI Mask Overlay
 * @category UI
 */
import { Camera, Color, Sprite, SpriteMaskInteraction, Texture2D, WebGLEngine } from "@galacean/engine";
import { CanvasRenderMode, Image, Mask, RectMask2D, Text, UICanvas, UITransform } from "@galacean/engine-ui";

WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  scene.background.solidColor = new Color(0.03, 0.04, 0.07, 1);
  const root = scene.createRootEntity("Root");

  // Camera is required for default scene rendering even though overlay UI doesn't use it for projection.
  const cameraEntity = root.createChild("Camera");
  cameraEntity.transform.setPosition(0, 0, 10);
  cameraEntity.addComponent(Camera);

  const canvasEntity = root.createChild("UICanvas");
  const uiCanvas = canvasEntity.addComponent(UICanvas);
  uiCanvas.renderMode = CanvasRenderMode.ScreenSpaceOverlay;
  uiCanvas.referenceResolutionPerUnit = 100;
  uiCanvas.referenceResolution.set(1200, 800);

  const solidSprite = createSolidSprite(engine);

  // ===== Left half: SpriteMask (Mask component) =====
  const maskGroup = canvasEntity.createChild("MaskGroup");
  (<UITransform>maskGroup.transform).setPosition(-300, 60, 0);

  const maskEntity = maskGroup.createChild("Mask");
  (<UITransform>maskEntity.transform).size.set(280, 280);
  const mask = maskEntity.addComponent(Mask);
  mask.sprite = solidSprite;

  const insideEntity = maskGroup.createChild("InsideImage");
  (<UITransform>insideEntity.transform).size.set(440, 440);
  const inside = insideEntity.addComponent(Image);
  inside.sprite = solidSprite;
  inside.color.set(0.91, 0.3, 0.24, 1);
  inside.maskInteraction = SpriteMaskInteraction.VisibleInsideMask;

  const maskLabelEntity = maskGroup.createChild("Label");
  (<UITransform>maskLabelEntity.transform).size.set(360, 60);
  (<UITransform>maskLabelEntity.transform).setPosition(0, -260, 0);
  const maskLabel = maskLabelEntity.addComponent(Text);
  maskLabel.text = "Mask  (Overlay)";
  maskLabel.fontSize = 32;
  maskLabel.color.set(1, 1, 1, 1);

  // ===== Right half: RectMask2D =====
  const rectGroup = canvasEntity.createChild("RectGroup");
  (<UITransform>rectGroup.transform).setPosition(300, 60, 0);

  const viewportEntity = rectGroup.createChild("Viewport");
  (<UITransform>viewportEntity.transform).size.set(360, 280);
  const viewport = viewportEntity.addComponent(Image);
  viewport.sprite = solidSprite;
  viewport.color.set(0.17, 0.18, 0.2, 1);
  viewportEntity.addComponent(RectMask2D);

  const contentEntity = viewportEntity.createChild("Content");
  (<UITransform>contentEntity.transform).size.set(560, 480);
  (<UITransform>contentEntity.transform).setPosition(60, -50, 0);

  const tileColors = [
    new Color(0.91, 0.3, 0.24, 1),
    new Color(0.16, 0.5, 0.73, 1),
    new Color(0.18, 0.8, 0.44, 1),
    new Color(0.95, 0.61, 0.07, 1)
  ];
  const tileSize = 220;
  const gap = 20;
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 2; col++) {
      const i = row * 2 + col;
      const tileEntity = contentEntity.createChild(`Tile_${i}`);
      const t = <UITransform>tileEntity.transform;
      t.size.set(tileSize, tileSize);
      t.setPosition(col * (tileSize + gap) - (tileSize + gap) / 2, (tileSize + gap) / 2 - row * (tileSize + gap), 0);

      const tile = tileEntity.addComponent(Image);
      tile.sprite = solidSprite;
      tile.color = tileColors[i];

      const labelEntity = tileEntity.createChild("Label");
      (<UITransform>labelEntity.transform).size.set(tileSize, tileSize);
      const label = labelEntity.addComponent(Text);
      label.text = `${i + 1}`;
      label.fontSize = 64;
      label.color.set(1, 1, 1, 1);
    }
  }

  const rectLabelEntity = rectGroup.createChild("Label");
  (<UITransform>rectLabelEntity.transform).size.set(360, 60);
  (<UITransform>rectLabelEntity.transform).setPosition(0, -260, 0);
  const rectLabel = rectLabelEntity.addComponent(Text);
  rectLabel.text = "RectMask2D  (Overlay)";
  rectLabel.fontSize = 32;
  rectLabel.color.set(1, 1, 1, 1);

  // Top header
  const headerEntity = canvasEntity.createChild("Header");
  (<UITransform>headerEntity.transform).size.set(900, 80);
  (<UITransform>headerEntity.transform).setPosition(0, 320, 0);
  const header = headerEntity.addComponent(Text);
  header.text = "ScreenSpaceOverlay  ·  Mask & RectMask2D";
  header.fontSize = 36;
  header.color.set(0.85, 0.92, 1, 1);

  engine.run();
});

function createSolidSprite(engine: WebGLEngine): Sprite {
  const texture = new Texture2D(engine, 1, 1);
  texture.setPixelBuffer(new Uint8Array([255, 255, 255, 255]));
  return new Sprite(engine, texture);
}
