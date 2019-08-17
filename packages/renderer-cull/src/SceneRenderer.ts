'use strict';

import {BasicSceneRenderer} from '@alipay/o3-renderer-basic';
import {Frustum} from './Frustum';

export class SceneRenderer extends BasicSceneRenderer {

  private _frustum: Frustum;

  constructor(camera) {

    super(camera);

    this._frustum = new Frustum();

  }

  /**
   * 更新Frustum，执行场景渲染流程
   */
  render() {

    this._frustum.update(this._camera);
    super.render();

  }

  /**
   * 通过视锥剪裁，决定是否将一个 Primitive 对象添加到渲染队列
   * @param nodeAbility
   * @param {Primitive} primitive
   * @param {Material} mtl
   */
  pushPrimitive(nodeAbility, primitive, mtl) {

    let add = true;

    //-- 进行视锥剪裁
    if ('boundingBoxMax' in primitive && 'boundingBoxMin' in primitive) {

      add = this._frustum.intersectsBox(primitive.boundingBoxMax, primitive.boundingBoxMin);

    }

    //-- 添加到渲染队列
    if (add) {

      super.pushPrimitive(nodeAbility, primitive, mtl);

    }

  }

}
