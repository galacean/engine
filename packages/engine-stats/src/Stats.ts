import { EngineFeature, Engine, Scene } from '@alipay/o3-core';
import Monitor from './Monitor';

/**
 * Engine Feature：显示 FPS 等引擎状态数据
 */
export class Stats extends EngineFeature {

  private monitor:Monitor;
  /**
   * 构造函数
   */
  constructor() {

    super();

  }


  /**
   * tick 前置回调
   */
  preTick(engine: Engine, currentScene: Scene): void {
    if (!this.monitor) {
      if (currentScene[0] && currentScene[0].activeCameras[0] && currentScene[0].activeCameras[0].canvas) {
        this.monitor = new Monitor(currentScene[0].activeCameras[0].canvas)
      }
    }
  }

  /**
   * tick 后置回调
   */
  postTick(engine: Engine, currentScene: Scene): void {
    if (this.monitor) {
      this.monitor.update();
    }
  }
}