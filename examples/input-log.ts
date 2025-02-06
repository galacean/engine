/**
 * @title Input Logger
 * @category input
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*GX8yQIgHyUYAAAAAAAAAAAAADiR2AQ/original
 */
import { WebGLEngine } from "@galacean/engine";
import * as dat from "dat.gui";
import { InputLogger } from "@galacean/engine-toolkit-input-logger";

const gui = new dat.GUI();

// Create engine
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();
  engine.canvas._webCanvas.style.touchAction = "none";
  const inputLogger = new InputLogger(engine);
  engine.run();

  // Debug
  const debugInfo = {
    Pointer: true,
    Keyboard: true,
    Size: 1,
    Color: [255, 0, 0],
    OffsetX: 0,
    OffsetY: 0,
  };

  gui.add(debugInfo, "Pointer").onChange((v: boolean) => {
    inputLogger.showPointer = v;
  });

  gui.add(debugInfo, "Keyboard").onChange((v: boolean) => {
    inputLogger.showKeyBoard = v;
  });

  const textFolder = gui.addFolder("Info");
  textFolder.add(debugInfo, "OffsetX", 0, 1, 0.02).onChange((v: number) => {
    inputLogger.offset.x = v;
    inputLogger.offset = inputLogger.offset;
  });

  textFolder.add(debugInfo, "OffsetY", 0, 1, 0.02).onChange((v: number) => {
    inputLogger.offset.y = v;
    inputLogger.offset = inputLogger.offset;
  });

  textFolder.add(debugInfo, "Size", 0.5, 2, 0.1).onChange((v: number) => {
    inputLogger.scale = v;
  });

  textFolder.addColor(debugInfo, "Color").onChange((v: number) => {
    inputLogger.color.set(v[0] / 255, v[1] / 255, v[2] / 255, 1);
  });

  inputLogger.color.set(1, 0, 0, 1);
  textFolder.open();
});
