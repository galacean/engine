/**
 * @title Sprite Material Glitch
 * @category 2D
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*cfmPS5POgLgAAAAAAAAAAAAADiR2AQ/original
 */

import { OrbitControl } from "@galacean/engine-toolkit-controls";
import * as dat from "dat.gui";
import {
  AssetType,
  BlendFactor,
  Camera,
  CullMode,
  Engine,
  Material,
  RenderQueueType,
  Shader,
  Sprite,
  SpriteRenderer,
  Texture2D,
  WebGLEngine,
} from "@galacean/engine";

main();

async function main() {
  // Create engine
  const engine = await WebGLEngine.create({ canvas: "canvas" });
  engine.canvas.resizeByClientSize();

  // Create root entity.
  const rootEntity = engine.sceneManager.activeScene.createRootEntity();

  // Create camera.
  const cameraEntity = rootEntity.createChild("Camera");
  cameraEntity.transform.setPosition(0, 0, 12);
  cameraEntity.addComponent(Camera);
  cameraEntity.addComponent(OrbitControl);

  engine.resourceManager
    .load({
      // Sprite texture
      url: "https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*5wypQ5JyDLkAAAAAAAAAAAAAARQnAQ",
      type: AssetType.Texture2D,
    })
    .then((texture: Texture2D) => {
      // Create origin sprite entity.
      const spriteEntity = rootEntity.createChild("GlitchSprite");
      const material = addCustomMaterial(engine);
      const renderer = spriteEntity.addComponent(SpriteRenderer);
      renderer.sprite = new Sprite(engine, texture);
      renderer.setMaterial(material);

      // Add Data UI.
      addDataGUI(material);
    });

  engine.run();
}

function addCustomMaterial(engine: Engine): Material {
  const material = new Material(engine, Shader.find("SpriteGlitchRGBSplit"));

  // Init state.
  const renderState = material.renderState;
  const target = renderState.blendState.targetBlendState;
  target.enabled = true;
  target.sourceColorBlendFactor = BlendFactor.SourceAlpha;
  target.destinationColorBlendFactor = BlendFactor.OneMinusSourceAlpha;
  target.sourceAlphaBlendFactor = BlendFactor.One;
  target.destinationAlphaBlendFactor = BlendFactor.OneMinusSourceAlpha;
  renderState.depthState.writeEnabled = false;
  renderState.rasterState.cullMode = CullMode.Off;
  renderState.renderQueueType = RenderQueueType.Transparent;

  // Set material shader data.
  const { shaderData } = material;
  shaderData.setFloat("u_indensity", 0.5);

  return material;
}

/**
 * Add data GUI.
 */
function addDataGUI(material: Material) {
  const { shaderData } = material;
  const gui = new dat.GUI();
  const guiData = {
    indensity: 0.5,
    reset: () => {
      guiData.indensity = 0.5;
      shaderData.setFloat("u_indensity", 0.5);
    },
  };

  gui
    .add(guiData, "indensity", 0.0, 1.0, 0.01)
    .onChange((value: number) => {
      shaderData.setFloat("u_indensity", value);
    })
    .listen();

  gui.add(guiData, "reset").name("重置");
  return guiData;
}

// Custom shader
const spriteVertShader = `
  uniform mat4 camera_VPMat;

  attribute vec3 POSITION;
  attribute vec2 TEXCOORD_0;
  attribute vec4 COLOR_0;

  varying vec4 v_color;
  varying vec2 v_uv;

  void main()
  {
    gl_Position = camera_VPMat * vec4(POSITION, 1.0);
    v_color = COLOR_0;
    v_uv = TEXCOORD_0;
  }
`;

const spriteFragmentShader = `
  uniform sampler2D renderer_SpriteTexture;
  uniform vec4 scene_ElapsedTime;
  uniform float u_indensity;

  varying vec2 v_uv;
  varying vec4 v_color;

  float randomNoise(float time) {
    return fract(sin(dot(vec2(time, 2), vec2(12.9898, 78.233))));
  }

  void main() {
    float splitAmount = u_indensity * randomNoise(scene_ElapsedTime.x * 100.0);

    vec4 normalColor = texture2D(renderer_SpriteTexture, v_uv);
    float r = texture2D(renderer_SpriteTexture, vec2(v_uv.x + splitAmount, v_uv.y)).r;
    float b = texture2D(renderer_SpriteTexture, vec2(v_uv.x - splitAmount, v_uv.y)).b;
    gl_FragColor = vec4(r, normalColor.g, b, normalColor.a) * v_color;
  }
`;

Shader.create("SpriteGlitchRGBSplit", spriteVertShader, spriteFragmentShader);
