import { StatsPanel } from './StatsPanel';
import { EngineFeature, Engine, Scene } from '@alipay/o3-core';

/**
 * Engine Feature：显示 FPS 等引擎状态数据
 */
export class Stats extends EngineFeature {

  private _mode;
  private _beginTime;
  private _prevTime;
  private _frames;
  private _container;
  private _fpsPanel;
  private _msPanel;
  private _memPanel;

  /**
   * 构造函数
   */
  constructor() {

    super();
    //-- 状态数据
    this._mode = 0;
    this._beginTime = (performance || Date).now();
    this._prevTime = this._beginTime;
    this._frames = 0;

    //-- create container
    const self = this;
    const container = document.createElement('div');

    container.style.cssText = 'position:fixed;top:0;left:0;cursor:pointer;opacity:0.9;z-index:10000';

    container.addEventListener('click', function (event) {

      event.preventDefault();
      self._showPanel(++self._mode % container.children.length);

    }, false);
    document.body.appendChild(container);

    this._container = container;

    //-- create panels
    this._fpsPanel = this._addPanel(new StatsPanel('FPS', '#0ff', '#002'));
    this._msPanel = this._addPanel(new StatsPanel('MS', '#0f0', '#020'));

    if (performance && performance["memory"]) {

      this._memPanel = this._addPanel(new StatsPanel('MB', '#f08', '#201'));

    }

    //--
    this._showPanel(this._mode);

  }

  /**
   * 添加一个面板
   * @param {StatsPanel} panel
   */
  _addPanel(panel) {

    this._container.appendChild(panel.dom);
    return panel;

  }

  /**
   * 显示指定的面板
   * @param {number} id
   */
  _showPanel(id: number): void {

    const container = this._container;
    for (let i = 0; i < container.children.length; i++) {

      container.children[i].style.display = i === id ? 'block' : 'none';

    }
    this._mode = id;

  }

  /**
   * tick 前置回调
   */
  preTick(engine: Engine, currentScene: Scene): void {

    this._beginTime = (performance || Date).now();

  }

  /**
   * tick 后置回调
   */
  postTick(engine: Engine, currentScene: Scene): void {

    this._frames++;

    const time = (performance || Date).now();

    this._msPanel.update(time - this._beginTime, 200);

    if (time > this._prevTime + 1000) {

      this._fpsPanel.update((this._frames * 1000) / (time - this._prevTime), 100);

      this._prevTime = time;
      this._frames = 0;

      if (this._memPanel) {

        const memory = performance["memory"];
        this._memPanel.update(memory.usedJSHeapSize / 1048576, memory.jsHeapSizeLimit / 1048576);

      } // end of if

    }// end of if

  }

}
