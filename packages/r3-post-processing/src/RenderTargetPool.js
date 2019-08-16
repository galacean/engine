import { RenderTarget } from '@alipay/r3-material';

const DEFAULT_PROPS = {
  scene_4096:{
    width:4096,
    height:4096,
    clearColor: [ 0.0, 0.0, 0.0, 1.0 ]
  },
  scene_2048:{
    width:2048,
    height:2048,
    clearColor: [ 0.0, 0.0, 0.0, 1.0 ]
  },
  scene_1024:{
    width:1024,
    height:1024,
    clearColor: [ 0.0, 0.0, 0.0, 1.0 ]
  },
  scene_512:{
    width:512,
    height:512,
    clearColor: [ 0.0, 0.0, 0.0, 1.0 ]
  },
  scene_256:{
    width:256,
    height:256,
    clearColor: [ 0.0, 0.0, 0.0, 1.0 ]
  },
  scene_128:{
    width:128,
    height:128,
    clearColor: [ 0.0, 0.0, 0.0, 1.0 ]
  },
  scene_64:{
    width:64,
    height:64,
    clearColor: [ 0.0, 0.0, 0.0, 1.0 ]
  },
  scene_32:{
    width:32,
    height:32,
    clearColor: [ 0.0, 0.0, 0.0, 1.0 ]
  },
  backup_512:{
    width:512,
    height:512,
    clearColor: [ 0.0, 0.0, 0.0, 1.0 ]
  },
  backup_256:{
    width:256,
    height:256,
    clearColor: [ 0.0, 0.0, 0.0, 1.0 ]
  },
  backup_128:{
    width:128,
    height:128,
    clearColor: [ 0.0, 0.0, 0.0, 1.0 ]
  },
  backup_64:{
    width:64,
    height:64,
    clearColor: [ 0.0, 0.0, 0.0, 1.0 ]
  },
  backup_32:{
    width:32,
    height:32,
    clearColor: [ 0.0, 0.0, 0.0, 1.0 ]
  }
};

/**
 * Render Target 可以在多个后处理效果直接共享
 * @private
 */
export class RenderTargetPool {

  constructor(){

    this.pool = {};

  }

  /**
   * 查找一个 Render Target，如果没有，则创建一个新的
   * @param {string} name 名称
   * @param {object} props 配置
   */
  require( name, props ){

    if( props ){

      return new RenderTarget( name, props  );

    }
    else if( DEFAULT_PROPS[name] ){

      return new RenderTarget( name, DEFAULT_PROPS[name]  );

    }
    else{

      console.log( 'post process require render target failed: ' + name );

    }

    return this.pool[name];

  }


};
