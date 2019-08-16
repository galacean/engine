/**
 * 本示例展示如何实现拖尾效果
 */
import { Engine, NodeAbility } from '@alipay/r3-core';
import { ADefaultCamera } from '@alipay/r3-default-camera';
import '@alipay/r3-engine-stats';
import { Resource, ResourceLoader } from '@alipay/r3-loader';
import { ATrailRenderer, TrailMaterial } from '@alipay/r3-trail';
import { AOrbitControls } from '@alipay/r3-orbit-controls';


// 创建引擎、获取场景根节点
const engine = new Engine();
const scene = engine.currentScene;
const rootNode = scene.root;

// 在场景中创建相机节点、配置位置和目标方向
const cameraNode = rootNode.createChild('camera_node');
let camera = cameraNode.createAbility(ADefaultCamera, {
  canvas: 'r3-demo', position: [0, 0, 10], target: [0, 0, 0]
});
let controler = cameraNode.createAbility(AOrbitControls, { canvas: document.getElementById('r3-demo')});

// 控制 node 延蝴蝶曲线运动
class AButterFlyMove extends NodeAbility {

  constructor(node, props) {
    super(node);
    this.startTime = props.startTime || 0;
    this.trend = props.trend || 1.0;
  }

  update(deltaTime) {
    let time = (this.engine.time.timeSinceStartup + this.startTime) * this.trend;
    let t = time * 0.001;
    let d = (Math.exp(Math.cos(t)) - 2*Math.cos(4*t) + Math.pow(Math.sin(t/12), 5)) * 0.8;
    let x = Math.sin(t) * d;
    let y = Math.cos(t) * d;
    let z = -1;

    let pos = this.node.position;
    pos[0] = x;
    pos[1] = y;
    pos[2] = z;
    this.node.position = pos;
  }
}

const techRes = new Resource('image', {
  type: 'texture',
  url: './tail.png'
});

const props = {
  material: new TrailMaterial('trail_mtl'),
  stroke: 0.2
};

const resourceLoader = new ResourceLoader(engine);
resourceLoader.load(techRes, (err,res) => {
  const texture = res.asset;
  props.material.setValue('u_texture', texture);
});

// 在场景中创建 butterfly 节点
function createButterflyTail(name, startTime) {
  const trail = rootNode.createChild("name");
  const trailRenderer = trail.createAbility(ATrailRenderer, props);
  const move = trail.createAbility(AButterFlyMove, { startTime });
}

createButterflyTail('trail1');
createButterflyTail('trail2', 1000);
createButterflyTail('trail3', 2000);
createButterflyTail('trail4', 3000);
createButterflyTail('trail5', 4000);
createButterflyTail('trail6', 5000);

engine.run();

