/**
 * @title UI Text Outline
 * @category UI
 */
import * as dat from "dat.gui";
import { Camera, Color, WebGLEngine } from "@galacean/engine";
import { CanvasRenderMode, Text, UICanvas, UITransform } from "@galacean/engine-ui";

WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  scene.background.solidColor = new Color(0.05, 0.07, 0.1, 1);
  const root = scene.createRootEntity("Root");

  const cameraEntity = root.createChild("Camera");
  cameraEntity.transform.setPosition(0, 0, 10);
  const camera = cameraEntity.addComponent(Camera);

  const canvasEntity = root.createChild("UICanvas");
  const uiCanvas = canvasEntity.addComponent(UICanvas);
  uiCanvas.renderMode = CanvasRenderMode.ScreenSpaceCamera;
  uiCanvas.camera = camera;
  uiCanvas.referenceResolutionPerUnit = 100;
  uiCanvas.referenceResolution.set(1280, 800);

  // ---------- Matrix grid ----------
  // Rows = outlineWidth (0 / 1 / 2 / 4 / 8 px)
  // Cols = (text color, outline color) presets
  const widthCases = [0, 1, 2, 4, 8];
  const colorCases: { name: string; fill: Color; outline: Color }[] = [
    { name: "white / black", fill: new Color(1, 1, 1, 1), outline: new Color(0, 0, 0, 1) },
    { name: "black / white", fill: new Color(0, 0, 0, 1), outline: new Color(1, 1, 1, 1) },
    { name: "yellow / red", fill: new Color(1, 0.85, 0.1, 1), outline: new Color(0.85, 0.1, 0.1, 1) }
  ];

  const cellW = 380;
  const cellH = 110;
  const startX = -cellW * (colorCases.length - 1) * 0.5;
  const startY = 220;

  // Column headers
  for (let c = 0; c < colorCases.length; c++) {
    const headerEntity = canvasEntity.createChild(`header-${c}`);
    const ht = <UITransform>headerEntity.transform;
    ht.size.set(cellW, 32);
    ht.setPosition(startX + c * cellW, startY + cellH * 0.5 + 20, 0);
    const header = headerEntity.addComponent(Text);
    header.text = `text/outline = ${colorCases[c].name}`;
    header.fontSize = 18;
    header.color.set(0.7, 0.78, 0.9, 1);
  }

  for (let r = 0; r < widthCases.length; r++) {
    const w = widthCases[r];

    // Row label
    const labelEntity = canvasEntity.createChild(`row-label-${r}`);
    const lt = <UITransform>labelEntity.transform;
    lt.size.set(120, cellH);
    lt.setPosition(startX - cellW * 0.5 - 60, startY - r * cellH, 0);
    const label = labelEntity.addComponent(Text);
    label.text = `width = ${w}px`;
    label.fontSize = 18;
    label.color.set(0.7, 0.78, 0.9, 1);

    for (let c = 0; c < colorCases.length; c++) {
      const { fill, outline } = colorCases[c];

      const cell = canvasEntity.createChild(`cell-${r}-${c}`);
      const ct = <UITransform>cell.transform;
      ct.size.set(cellW, cellH);
      ct.setPosition(startX + c * cellW, startY - r * cellH, 0);
      const text = cell.addComponent(Text);
      text.text = "Hello 描边 Outline";
      text.fontSize = 36;
      text.color = fill;
      text.outlineWidth = w;
      text.outlineColor = outline;
    }
  }

  // ---------- Live preview controlled by dat.gui ----------
  const previewEntity = canvasEntity.createChild("preview");
  const previewTransform = <UITransform>previewEntity.transform;
  previewTransform.size.set(900, 160);
  previewTransform.setPosition(0, -300, 0);
  const preview = previewEntity.addComponent(Text);
  preview.text = "实时 Live 预览 Preview";
  preview.fontSize = 72;
  preview.color = new Color(1, 1, 1, 1);
  preview.outlineWidth = 3;
  preview.outlineColor = new Color(0, 0, 0, 1);

  const state = {
    fontSize: preview.fontSize,
    outlineWidth: preview.outlineWidth,
    fillColor: [255, 255, 255],
    outlineColor: [0, 0, 0],
    text: preview.text
  };

  const gui = new dat.GUI();
  gui.add(state, "text").onChange((v: string) => {
    preview.text = v;
  });
  gui.add(state, "fontSize", 12, 120, 1).onChange((v: number) => {
    preview.fontSize = v;
  });
  gui.add(state, "outlineWidth", 0, 8, 0.1).onChange((v: number) => {
    preview.outlineWidth = v;
  });
  gui.addColor(state, "fillColor").onChange((rgb: number[]) => {
    preview.color.set(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, 1);
  });
  gui.addColor(state, "outlineColor").onChange((rgb: number[]) => {
    preview.outlineColor.set(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, 1);
  });

  engine.run();
});
