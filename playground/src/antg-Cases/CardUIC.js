/**
 * 本示例展示如何使用几何体渲染器功能、如何创建几何体资源对象、如何创建材质对象
 */
import { ClearMode, Logger, MaterialType, DrawMode } from '@alipay/r3-base';
import { Engine } from '@alipay/r3-core';
import { GLRenderHardware } from '@alipay/r3-rhi-webgl';
import { BasicSceneRenderer } from '@alipay/r3-renderer-basic';
import { AGeometryRenderer } from '@alipay/r3-geometry';
import { vec3, vec4 } from '@alipay/r3-math';
import '@alipay/r3-engine-stats';
import createPlaneGeometry from './geometry';
import getTechniqueData from './technique';
import getWaveTechniqueData from './waveTechnique';
import AWave from './AWave';
import { ADirectLight } from '@alipay/r3-lighting';
import { Resource, ResourceLoader } from '@alipay/r3-loader';
import { Material } from '@alipay/r3-material';
import { ADefaultCamera } from '@alipay/r3-default-camera';

Logger.enable();

export default class CardUIC {
  constructor(props) {
    props = props || {};
    this.id = props.id || 'r3-demo';
    this.imgUrl = props.imgUrl;
    this.deltaX = props.deltaX || 250;
    this.onComplete = props.onComplete;

    const countX = props.countX || 75;
    const countY = props.countY || 48;
    this.geometry = createPlaneGeometry(countX, countY);
    this.normalImg = 'https://gw.alipayobjects.com/zos/rmsportal/UbarSOVpGZDvKVcomySG.jpg';

    this.resourceLoader = new ResourceLoader();
    this.technique = this._loadTechnique();
    this.waveTechnique = this._loadTechnique(true);

    let textureRes = [];

    for(let name in this.imgUrl) {
      textureRes.push(new Resource(name, {
        type: 'texture',
        url: this.imgUrl[name],
      }));
    }
    textureRes.push(new Resource('normal', {
      type: 'texture',
      url: this.normalImg,
    }));

    this.resourceLoader.batchLoad(textureRes, (err, res)=>{
      this.normal = res[textureRes.length - 1].asset;
      this._myR3Program(res);
      this.onComplete && this.onComplete(this);
    });
  }

  goPrev() {
    const position = this.cardWrapper.position;
    position[0] -= this.deltaX;
    this.cardWrapper.position = position;
  }

  goNext() {
    const position = this.cardWrapper.position;
    position[0] += this.deltaX;
    this.cardWrapper.position = position;
  }

  destroy() {
    this.engine.shutdown();
    this.engine = null;
  }

  _loadTechnique(isBg) {
    let techRes;
    let techniqueData;
    if(isBg) {
      techniqueData = getWaveTechniqueData('bg');
      techRes = new Resource('bg', {
        type: 'technique',
        data: techniqueData
      });
    } else {
      techniqueData = getTechniqueData('card', this.imgUrl);
      techRes = new Resource('card', {
        type: 'technique',
        data: techniqueData
      });
    }
    this.resourceLoader.load(techRes);
    return techRes.asset;
  }

  _myR3Program(textureRes) {
    // 创建引擎、获取场景根节点
    this.engine = new Engine();
    const scene = this.engine.currentScene;
    const rootNode = scene.root;

    const light = rootNode.createChild("light");
    light.createAbility(ADirectLight, {
      color: vec3.fromValues(0.4, 0.6, 0.75),
      intensity: 0.8
    });

    //-- create camera
    let cameraNode = rootNode.createChild('camera_node');
    let camera = cameraNode.createAbility(ADefaultCamera, {
      canvas: this.id,
      position: [0, 0, 250],
      clearParam: vec4.fromValues(0, 0, 0, 1)
    });

    this.cardWrapper = rootNode.createChild('cardWrapper');
    let index = 0;
    for(let name in this.imgUrl) {
      this._createPlane(name, index, textureRes[index++].asset);
    }

    this.backgroundNode = rootNode.createChild('background');
    this._createBackground();

    // 启动引擎
    this.engine.run();
  }

  _createPlane(name, index, texture) {
    const plane = this.cardWrapper.createChild(name);
    plane.position = [index * this.deltaX, 0, 0];
    const planeRenderer = plane.createAbility(AGeometryRenderer);
    planeRenderer.geometry = this.geometry;
    planeRenderer.setMaterial(this._createMaterial(name, texture));
    plane.createAbility(AWave);
  }

  _createBackground() {
    this.backgroundNode.position = [0, 0, -10];
    const backgroundRenderer = this.backgroundNode.createAbility(AGeometryRenderer);
    backgroundRenderer.geometry = createPlaneGeometry(150, 100);
    backgroundRenderer.geometry.mode = DrawMode.POINTS;

    backgroundRenderer.setMaterial(this._createBgMaterial());
    this.backgroundNode.createAbility(AWave);
  }

  _createMaterial(name, texture) {
    let mtl = new Material(name);
    mtl.technique = this.technique;
    // mtl.renderType = MaterialType.TRANSPARENT;
    mtl.setValue('s_diffuse', texture);
    mtl.setValue('s_normal', this.normal);
    return mtl;
  }

  _createBgMaterial() {
    let mtl = new Material('bgMtl');
    mtl.technique = this.waveTechnique;
    // mtl.renderType = MaterialType.TRANSPARENT;
    return mtl;
  }
}

