import { Engine, EngineFeature } from "@alipay/o3-core";
import { ADefaultCamera } from "@alipay/o3-default-camera";
import { Logger } from "@alipay/o3-base";

Logger.enable();

class TickFeature extends EngineFeature {
  preTick() {
    if (this.tick) this.tick();
  }
}

class World {
  constructor(canvas) {
    this.init(canvas);
  }

  init(canvas) {
    const engine = new Engine();
    this.engine = engine;
    const scene = engine.currentScene;
    this.scene = scene;
    const rootNode = scene.root;
    this.rootNode = rootNode;
    const cameraNode = rootNode.createChild("camera_node");
    const cameraAb = cameraNode.createAbility(ADefaultCamera, {
      canvas,
      position: [0, 0, 10],
      clearMode: 0,
      clearParam: [1, 0, 0, 1],
      near: 1,
      far: 300,
      fov: 60
    });
    this.camera = cameraNode;
    this.cameraAb = cameraAb;
    window.addEventListener("resize", this.onResize.bind(this));
    Engine.registerFeature(TickFeature);
  }

  onResize() {
    if (!this.resizeTimeout) {
      this.resizeTimeout = setTimeout(() => {
        this.resizeTimeout = null;
        this.cameraAb && this.cameraAb.updateSizes();
      }, 66);
    }
  }

  createChild(name) {
    const node = this.rootNode.createChild(name);
    return node;
  }

  addChild(node) {
    this.rootNode.addChild(node);
  }

  start(tick) {
    if (tick) TickFeature.prototype.tick = tick;
    this.engine.run();
  }

  render() {
    this.engine.run();
    this.engine.pause();
  }

  destroy() {
    this.engine.shutdown();
  }

  resume() {
    this.engine.resume();
  }
}

export default World;
