/**
 * @title Video Transparent
 * @category Video
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*2CRnR4sZL0kAAAAAAAAAAAAADiR2AQ/original
 */

import {
  BaseMaterial,
  BlendMode,
  Camera,
  Engine,
  Script,
  Shader,
  Sprite,
  SpriteRenderer,
  Texture2D,
  TextureFormat,
  TextureUsage,
  WebGLEngine,
} from "@galacean/engine";

// 透明度信息所在方向
function getFragmentByDirection(direction) {
  const rgb = `vec2(v_uv.x * 0.5000 + 0.5000, v_uv.y)`;
  const alpha = `vec2(v_uv.x * 0.5000, v_uv.y)`;
  const _rgb = `vec2(v_uv.x, v_uv.y * 0.5000 + 0.5000)`;
  const _alpha = `vec2(v_uv.x, v_uv.y * 0.5000)`;
  switch (direction) {
    case "left":
      return `vec2 uv_rgb = ${rgb};vec2 uv_alpha = ${alpha};`;
    case "right":
      return `vec2 uv_rgb = ${alpha};vec2 uv_alpha = ${rgb};`;
    case "top":
      return `vec2 uv_rgb = ${_rgb};vec2 uv_alpha = ${_alpha};`;
    case "down":
      return `vec2 uv_rgb = ${_alpha};vec2 uv_alpha = ${_rgb};`;
    default:
      return `vec2 uv_rgb = ${_alpha};vec2 uv_alpha = ${_rgb};`;
  }
}

class TransparentVideoMaterial extends BaseMaterial {
  static direction: "left" | "right" | "up" | "down" = "right";

  constructor(engine: Engine) {
    const name = "TransparentVideo" + TransparentVideoMaterial.direction;
    const shader =
      Shader.find(name) ||
      Shader.create(
        name,
        `
        attribute vec3 POSITION;
        attribute vec2 TEXCOORD_0;
      
        uniform mat4 renderer_MVPMat;
        varying vec2 v_uv;
      
        void main() {
          gl_Position = renderer_MVPMat * vec4(POSITION, 1.0);
          v_uv = TEXCOORD_0;
        }
      `,

        `
        precision highp float;
        uniform sampler2D renderer_SpriteTexture;
        varying vec2 v_uv;
        void main() {
          ${getFragmentByDirection(TransparentVideoMaterial.direction)}
          vec3 rgb = texture2D(renderer_SpriteTexture, uv_rgb).rgb;
          float alpha = texture2D(renderer_SpriteTexture, uv_alpha).r;
          gl_FragColor = vec4(rgb / alpha, alpha);
        }
      `
      );
    super(engine, shader);
    this.setState();
  }

  setState() {
    this.isTransparent = true;
    this.blendMode = BlendMode.Normal;
  }
}

class UpdateVideoScript extends Script {
  video: HTMLVideoElement;
  texture: Texture2D;

  onUpdate() {
    this.texture.setImageSource(this.video);
  }
}

WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();
  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();
  const cameraEntity = rootEntity.createChild();
  cameraEntity.transform.setPosition(0, 0, 10);
  const camera = cameraEntity.addComponent(Camera);
  camera.fieldOfView = 80;

  engine.run();

  const dom: HTMLVideoElement = document.createElement("video");
  // 视频分辨率
  const width = 2000;
  const height = 1624;
  dom.src =
    "https://gw.alipayobjects.com/v/huamei_w6ifet/afts/video/A*fds8S6LY2VYAAAAAAAAAAAAADjCHAQ";
  dom.crossOrigin = "anonymous";
  dom.loop = true;
  dom.muted = true;
  dom.playsInline = true;
  dom.play();

  // create video texture
  const texture = new Texture2D(
    engine,
    width,
    height,
    TextureFormat.R8G8B8,
    false,
    TextureUsage.Dynamic
  );

  // 创建精灵用于渲染视频
  const entity = rootEntity.createChild("video-transparent");
  const sr = entity.addComponent(SpriteRenderer);
  sr.sprite = new Sprite(engine, texture);
  // 初始化的时候调用一次即可
  sr.width *= 0.5;
  // 视频左半边存储透明度
  TransparentVideoMaterial.direction = "right";
  const material = new TransparentVideoMaterial(engine);
  sr.setMaterial(material);

  function updateVideo() {
    texture.setImageSource(dom);
    (dom as any).requestVideoFrameCallback(updateVideo);
  }

  if ("requestVideoFrameCallback" in dom) {
    (dom as any).requestVideoFrameCallback(updateVideo);
  } else {
    const script = rootEntity.addComponent(UpdateVideoScript);
    script.video = dom;
    script.texture = texture;
  }
});
