import * as dat from "dat.gui";
import {
  BackgroundMode, TextureCube, Background
} from "@galacean/engine";

export function addGUI(cubeMaps: TextureCube[], background: Background) {
  const gui = new dat.GUI();

  let colorGUI = null;
  let cubeMapGUI = null;
  let fitModeGUI = null;
  
  function hide(_gui) {
    _gui.__li.style.display = "none";
  }
  function show(_gui) {
    _gui.__li.style.display = "block";
  }
  background.mode = BackgroundMode.Texture;
  gui
    .add(background, "mode", {
      Sky: BackgroundMode.Sky,
      SolidColor: BackgroundMode.SolidColor,
      Texture: BackgroundMode.Texture,
    })
    .onChange((v) => {
      const mode = (background.mode = parseInt(v));
      hide(colorGUI);
      hide(cubeMapGUI);
      hide(fitModeGUI);
      switch (mode) {
        case BackgroundMode.Sky:
          show(cubeMapGUI);
          break;
        case BackgroundMode.SolidColor:
          show(colorGUI);
          break;
        case BackgroundMode.Texture:
          show(fitModeGUI);
          break;
      }
    });

  const solidColor = background.solidColor;
  let colorObj = {
    color: [
      solidColor.r / 255,
      solidColor.g / 255,
      solidColor.b / 255,
      solidColor.a,
    ],
  };
  colorGUI = gui.addColor(colorObj, "color").onChange((v) => {
    background.solidColor.set(v[0] / 255, v[1] / 255, v[2] / 255, v[3]);
  });

  const obj = {
    cubeMap: 0,
  };

  const mode = {
    fitMode: 1,
  };

  cubeMapGUI = gui
    .add(obj, "cubeMap", { cubeMap1: 0, cubeMap2: 1 })
    .onChange((v) => {
      // @ts-ignore
      background.sky.material.texture = cubeMaps[parseInt(v)];
    });
  fitModeGUI = gui
    .add(mode, "fitMode", { AspectFitWidth: 0, AspectFitHeight: 1, Fill: 2 })
    .onChange((v) => {
      background.textureFillMode = parseInt(v);
    });

  // init
  background.mode = BackgroundMode.Texture;
  hide(colorGUI);
  hide(cubeMapGUI);
  show(fitModeGUI);
}