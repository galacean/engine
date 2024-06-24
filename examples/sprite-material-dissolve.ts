/**
 * @title Sprite Material Dissolve
 * @category 2D
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*9EfxR5IhShwAAAAAAAAAAAAADiR2AQ/original
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
  Script,
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

  // Create root entity
  const rootEntity = engine.sceneManager.activeScene.createRootEntity();

  // Create camera
  const cameraEntity = rootEntity.createChild("Camera");
  cameraEntity.transform.setPosition(0, 0, 12);
  cameraEntity.addComponent(Camera);
  cameraEntity.addComponent(OrbitControl);

  engine.resourceManager
    .load([
      {
        // Sprite texture
        url: "https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*L2GNRLWn9EAAAAAAAAAAAAAAARQnAQ",
        type: AssetType.Texture2D,
      },
      {
        // Noise texture
        url: "https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*j2xJQL0e6J4AAAAAAAAAAAAAARQnAQ",
        type: AssetType.Texture2D,
      },
      {
        // Ramp texture
        url: "https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*ygj3S7sm4hQAAAAAAAAAAAAAARQnAQ",
        type: AssetType.Texture2D,
      },
    ])
    .then((textures: Texture2D[]) => {
      // Create origin sprite entity.
      const spriteEntity = rootEntity.createChild("DissolveSprite");
      const material = addCustomMaterial(engine, textures[1], textures[2]);
      const renderer = spriteEntity.addComponent(SpriteRenderer);
      renderer.sprite = new Sprite(engine, textures[0]);
      renderer.setMaterial(material);

      // Add dissolve animate script.
      const script = spriteEntity.addComponent(AnimateScript);
      // Add custom material.
      script.material = material;
      // Add Data UI.
      script.guiData = addDataGUI(script.material, script);
    });

  engine.run();
}

function addCustomMaterial(
  engine: Engine,
  noiseTexture: Texture2D,
  rampTexture: Texture2D
): Material {
  const material = new Material(engine, Shader.find("SpriteDissolve"));

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
  material.renderState.renderQueueType = RenderQueueType.Transparent;

  // Set material shader data.
  const { shaderData } = material;
  shaderData.setFloat("u_threshold", 0.0);
  shaderData.setFloat("u_edgeLength", 0.1);
  shaderData.setTexture("u_rampTexture", rampTexture);
  shaderData.setTexture("u_noiseTexture", noiseTexture);

  return material;
}

/**
 * Add data GUI.
 */
function addDataGUI(material: Material, animationScript: AnimateScript) {
  const { shaderData } = material;
  const gui = new dat.GUI();
  const guiData = {
    threshold: 0.0,
    edgeLength: 0.1,
    reset: () => {
      guiData.threshold = 0.0;
      guiData.edgeLength = 0.1;
      shaderData.setFloat("u_threshold", 0.0);
      shaderData.setFloat("u_edgeLength", 0.1);
    },
    pause: function () {
      animationScript.enabled = false;
    },
    resume: function () {
      animationScript.enabled = true;
    },
  };

  gui
    .add(guiData, "threshold", 0.0, 1.0, 0.01)
    .onChange((value: number) => {
      shaderData.setFloat("u_threshold", value);
    })
    .listen();
  gui
    .add(guiData, "edgeLength", 0.0, 0.2, 0.001)
    .onChange((value: number) => {
      shaderData.setFloat("u_edgeLength", value);
    })
    .listen();
  gui.add(guiData, "reset").name("重置");
  gui.add(guiData, "pause").name("暂停动画");
  gui.add(guiData, "resume").name("继续动画");

  return guiData;
}

class AnimateScript extends Script {
  guiData: any;
  material: Material;

  /**
   * The main loop, called frame by frame.
   * @param deltaTime - The deltaTime when the script update.
   */
  onUpdate(deltaTime: number): void {
    const { guiData } = this;
    const threshold = (guiData.threshold + deltaTime * 0.3) % 1.0;

    // Update gui data.
    guiData.threshold = threshold;
    // Update material data.
    this.material.shaderData.setFloat("u_threshold", threshold);
  }
}

// Custom shader
const spriteVertShader = `
  precision highp float;

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
  precision mediump float;
  precision mediump int;

  uniform sampler2D renderer_SpriteTexture;
  uniform sampler2D u_noiseTexture;
  uniform sampler2D u_rampTexture;
  uniform float u_threshold;
  uniform float u_edgeLength;

  varying vec2 v_uv;
  varying vec4 v_color;

  vec4 lerp(vec4 a, vec4 b, float w) {
    return a + w * (b - a);
  }

  void main() {
    float r = texture2D(u_noiseTexture, v_uv).r;
    float diff = r - u_threshold;
    if (diff <= 0.0) {
      discard;
    }

    float degree = clamp(0.0, 1.0, diff / u_edgeLength);
    vec4 edgeColor = texture2D(u_rampTexture, vec2(degree, degree));
    vec4 color = texture2D(renderer_SpriteTexture, v_uv);
    vec4 finalColor = lerp(edgeColor, color, degree);
    gl_FragColor = vec4(finalColor.rgb, color.a) * v_color;
  }
`;

Shader.create("SpriteDissolve", spriteVertShader, spriteFragmentShader);
