import { NodeAbility } from "@alipay/o3-core";
import { AHUDLayer } from '../common/AHUDLayer';

/**
 * 动态添加和删除HUD控件
 */
export class ADynamicChange extends NodeAbility {

  constructor(node) {
    super(node);

    this._widgets = [];
    this._changeTime = 0;
    this._changeInternal = 3000;

  }

  setWidgetsInfo(widgets) {
    this._widgets = widgets;
  }

  update(deltaTime) {

    this._changeTime += deltaTime;
    if (this._changeTime > this._changeInternal) {
      this._changeTime = 0;

      let idx = Math.floor(Math.random() * this._widgets.length);

      let r = Math.floor(Math.random() * 255);
      let g = Math.floor(Math.random() * 255);
      let b = Math.floor(Math.random() * 255);
      let a = 1;
      let backgroundStyle = 'rgba(' + r + ',' +g + ',' + b + ',' + a + ')';

      let width = 100 + Math.floor(Math.random() * 100);
      let height = 50 + Math.floor(Math.random() * 100);
      let worldSize = [width/150, height/150];
      let layerProps = {
        spriteID: 'layer' + idx,
        textureSize: [width, height],
        renderMode: '3D',
        worldSize,
        backgroundStyle
      };

      const layer = this._widgets[idx].node.createAbility(AHUDLayer, layerProps);

      this._widgets[idx].destroy();
      this._widgets[idx] = layer;
    }
  }
}

