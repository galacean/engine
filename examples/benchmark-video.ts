/**
 * @title Video
 * @category Benchmark
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*3E8EQaK_xVEAAAAAAAAAAAAADiR2AQ/original
 */

import {
  Camera,
  DependentMode,
  Entity,
  Script,
  Sprite,
  SpriteRenderer,
  Texture2D,
  TextureFormat,
  TextureUsage,
  Vector3,
  WebGLEngine,
} from "@galacean/engine";
import { Stats } from "@galacean/engine-toolkit";

async function main() {
  // Create engine object
  const engine = await WebGLEngine.create({
    canvas: "canvas",
  });
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  // Create camera
  const cameraEntity = rootEntity.createChild("camera_entity");
  cameraEntity.transform.setPosition(0, 0, 20);
  cameraEntity.transform.lookAt(new Vector3(0, 0, 0));
  cameraEntity.addComponent(Camera);
  cameraEntity.addComponent(Stats);

  // Add videos
  for (let i = 0; i < 7; ++i) {
    const posX = -12 + i * 4;
    addVideo(rootEntity, posX, 4);
    addVideo(rootEntity, posX, -4);
  }

  // Run engine
  engine.run();
}

function addVideo(parent: Entity, posX: number, posY: number): void {
  const videoEntity = parent.createChild("");
  videoEntity.addComponent(VideoScript);
  videoEntity.transform.setPosition(posX, posY, 0);
}
export class VideoScript extends Script {
  static videos = {
    "540p_0": {
      width: 480,
      height: 960,
      url: "https://gw.alipayobjects.com/v/huamei_p0cigc/afts/video/A*dftzSq2szUsAAAAAAAAAAAAADtN3AQ",
    },
    "540p_1": {
      width: 480,
      height: 960,
      url: "https://gw.alipayobjects.com/v/huamei_p0cigc/afts/video/A*7gPzSo3RxlQAAAAAAAAAAAAADtN3AQ",
    },
    "540p_2": {
      width: 512,
      height: 1024,
      url: "https://mdn.alipayobjects.com/huamei_p0cigc/afts/file/A*ZOgXRbmVlsIAAAAAAAAAAAAADoB5AQ",
    },
    "540p_3": {
      width: 512,
      height: 1024,
      url: "https://mdn.alipayobjects.com/huamei_p0cigc/afts/file/A*8xcvSJqCc3IAAAAAAAAAAAAADoB5AQ",
    },
  };
  static videoIndex: number = 0;

  video: HTMLVideoElement;
  texture: Texture2D;
  noVideoFrameCallback: boolean = false;

  onAwake() {
    const { width, height, url } =
      VideoScript.videos[`540p_${VideoScript.videoIndex++}`];

    if (VideoScript.videoIndex === 4) {
      VideoScript.videoIndex = 0;
    }

    const spriteRenderer = this.entity.addComponent(SpriteRenderer);
    const { engine } = this;
    const texture = new Texture2D(
      engine,
      width,
      height,
      TextureFormat.R8G8B8A8,
      false,
      TextureUsage.Dynamic
    );
    spriteRenderer.sprite = new Sprite(engine, texture);
    this.entity.transform.setScale(0.75, 0.75, 0.75);

    const videoElement = document.createElement("video");
    videoElement.src = url;
    videoElement.crossOrigin = "anonymous";
    videoElement.loop = true;
    videoElement.muted = true;
    videoElement.play();
    videoElement.playsInline = true;
    document.body.onclick = () => {
      videoElement.play();
    };

    const updateVideo = () => {
      videoElement.readyState >= 2 && texture.setImageSource(videoElement);
      videoElement.requestVideoFrameCallback(updateVideo);
    };

    if ("requestVideoFrameCallback" in videoElement) {
      updateVideo();
    } else {
      this.texture = texture;
      this.video = videoElement;
      this.noVideoFrameCallback = true;
    }
  }

  onUpdate() {
    if (this.noVideoFrameCallback && this.video.readyState >= 2) {
      this.texture.setImageSource(this.video);
    }
  }
}

main();
