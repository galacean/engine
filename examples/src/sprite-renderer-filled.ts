/**
 * @title Sprite Filled
 * @category 2D
 */

import * as dat from "dat.gui";
import {
  AssetType,
  Camera,
  Sprite,
  SpriteDrawMode,
  SpriteFilledMode,
  SpriteFilledOrigin,
  SpriteRenderer,
  Texture2D,
  Vector3,
  WebGLEngine
} from "@galacean/engine";

WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  scene.background.solidColor.set(0.15, 0.15, 0.18, 1);
  const rootEntity = scene.createRootEntity();

  // Create camera
  const cameraEntity = rootEntity.createChild("camera");
  cameraEntity.transform.setPosition(0, 0, 50);
  cameraEntity.addComponent(Camera);

  // Load texture and create sprite
  engine.resourceManager
    .load<Texture2D>({
      url: "https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*ApFPTZSqcMkAAAAAAAAAAAAAARQnAQ",
      type: AssetType.Texture2D
    })
    .then((texture) => {
      const spriteEntity = rootEntity.createChild("sprite");
      spriteEntity.transform.position = new Vector3(0, 0, 0);
      spriteEntity.transform.setScale(2, 2, 2);
      const renderer = spriteEntity.addComponent(SpriteRenderer);
      renderer.sprite = new Sprite(engine, texture);

      // Set filled mode
      renderer.drawMode = SpriteDrawMode.Filled;
      renderer.filledMode = SpriteFilledMode.Radial360;
      renderer.filledOrigin = SpriteFilledOrigin.Bottom;
      renderer.filledAmount = 0.75;
      renderer.filledClockWise = true;

      addGUI(renderer);
    });

  engine.run();

  function addGUI(renderer: SpriteRenderer) {
    const gui = new dat.GUI();

    const filledModeMap: Record<string, SpriteFilledMode> = {
      Horizontal: SpriteFilledMode.Horizontal,
      Vertical: SpriteFilledMode.Vertical,
      Radial90: SpriteFilledMode.Radial90,
      Radial180: SpriteFilledMode.Radial180,
      Radial360: SpriteFilledMode.Radial360
    };

    const originForRadial360: string[] = ["Right", "Top", "Left", "Bottom"];
    const originForRadial180: string[] = ["Right", "Top", "Left", "Bottom"];
    const originForRadial90: string[] = ["BottomLeft", "BottomRight", "TopRight", "TopLeft"];
    const originForHorizontal: string[] = ["Left", "Right"];
    const originForVertical: string[] = ["Bottom", "Top"];

    const originMap: Record<string, SpriteFilledOrigin> = {
      Right: SpriteFilledOrigin.Right,
      TopRight: SpriteFilledOrigin.TopRight,
      Top: SpriteFilledOrigin.Top,
      TopLeft: SpriteFilledOrigin.TopLeft,
      Left: SpriteFilledOrigin.Left,
      BottomLeft: SpriteFilledOrigin.BottomLeft,
      Bottom: SpriteFilledOrigin.Bottom,
      BottomRight: SpriteFilledOrigin.BottomRight
    };

    const state = {
      filledMode: "Radial360",
      origin: "Bottom",
      amount: 0.75,
      clockWise: true
    };

    const folder = gui.addFolder("Filled Sprite");
    folder.open();

    // Filled mode
    folder.add(state, "filledMode", Object.keys(filledModeMap)).onChange((value: string) => {
      renderer.filledMode = filledModeMap[value];
      updateOriginOptions(value);
    });

    // Origin
    let originCtrl = folder.add(state, "origin", originForRadial360).onChange((value: string) => {
      renderer.filledOrigin = originMap[value];
    });

    // Amount
    folder.add(state, "amount", 0.0, 1.0, 0.01).onChange((value: number) => {
      renderer.filledAmount = value;
    });

    // ClockWise
    folder.add(state, "clockWise").onChange((value: boolean) => {
      renderer.filledClockWise = value;
    });

    function updateOriginOptions(mode: string) {
      folder.remove(originCtrl);

      let options: string[];
      switch (mode) {
        case "Horizontal":
          options = originForHorizontal;
          break;
        case "Vertical":
          options = originForVertical;
          break;
        case "Radial90":
          options = originForRadial90;
          break;
        case "Radial180":
          options = originForRadial180;
          break;
        default:
          options = originForRadial360;
          break;
      }

      state.origin = options[0];
      renderer.filledOrigin = originMap[state.origin];

      originCtrl = folder.add(state, "origin", options).onChange((value: string) => {
        renderer.filledOrigin = originMap[value];
      });
    }
  }
});
