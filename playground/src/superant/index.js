import { Engine } from '@alipay/o3-core';
import { ADefaultCamera } from '@alipay/o3-default-camera';
import { ResourceLoader, Resource } from '@alipay/o3-loader';
import { AAnimation } from '@alipay/o3-animation';
import { AAmbientLight, ADirectLight, APointLight, ASpotLight } from '@alipay/o3-lighting';
import { BlinnPhongMaterial } from '@alipay/o3-mobile-material';
import { vec3, vec4 } from '@alipay/o3-math';
import { AOrbitControls } from '@alipay/o3-orbit-controls';

import '@alipay/o3-loader-gltf';
import '@alipay/o3-engine-stats';

// 创建引擎、获取场景根节点
const engine = new Engine();
const scene = engine.currentScene;
const rootNode = scene.root;

// 在场景中创建相机节点、配置位置和目标方向
const canvas = document.getElementById('o3-demo');
const cameraNode = rootNode.createChild('camera_node');
cameraNode.createAbility(ADefaultCamera, {
  canvas: canvas, position: [0, 0, 2], target: [0, 0, 0]
});
let controler = cameraNode.createAbility(AOrbitControls, { canvas: document.getElementById('mountNode')});

let ambientLight = rootNode.createChild( 'ambient_light_node' );
ambientLight.createAbility( AAmbientLight, {
    color: vec3.fromValues( 1, 1, 1 ), // 白光
    intensity: 0.4, // 强度
} );

// 创建一个节点用来挂载方向光
let directLight = rootNode.createChild( 'direction_light_node' );
// 创建一个方向光组件
directLight.createAbility( ADirectLight , {
    color: vec3.fromValues( 1, 1, 1 ),
    intensity: 0.5,
} );
// 通过改表节点的朝向控制光线方向
directLight.setRotationAngles(50, 160, 0);


// // 创建一个节点用来挂载方向光
// let directLight2 = rootNode.createChild( 'direction_light_node2' );
// // 创建一个方向光组件
// directLight2.createAbility( ADirectLight , {
//     color: vec3.fromValues( 1.0, 1.0, 1.0 ),
//     intensity: 0.4,
// } );
// // 通过改表节点的朝向控制光线方向
// directLight2.setRotationAngles(0, 60, 0);


// // 创建一个节点用来挂载方向光
// let directLight3 = rootNode.createChild( 'direction_light_node2' );
// // 创建一个方向光组件
// directLight3.createAbility( ADirectLight , {
//     color: vec3.fromValues( 1.0, 1.0, 1.0 ),
//     intensity: 0.3,
// } );
// directLight3.setRotationAngles(0, -60, 0);


// 创建资源对象，参数分别为对象名，资源类型，资源路径
const gltfRes = new Resource( 'pig_gltf', {
  type: 'gltf',
  url: 'https://gw.alipayobjects.com/os/r3/3a4b3b19-a763-419b-877f-483614770575/testmod.gltf',
} );
const resourceLoader = new ResourceLoader(engine);
resourceLoader.batchLoad( [ gltfRes ], ( err, res ) => {

  if ( err ) return console.error( err );

  const gltf = res[0];
  // 创建一个[Bling-Phong](https://en.wikipedia.org/wiki/Blinn%E2%80%93Phong_shading_model)材质,材质需支持动画
  let gltfRes = gltf.assets[0];
  gltfRes.materials = [];
  let newMaterial = new BlinnPhongMaterial('TestMaterial', true);
  newMaterial.shininess = 8;
  newMaterial.diffuse = gltfRes.textures[0]; // 材质的默认颜色
  newMaterial.ambient = gltfRes.textures[0]; // 材质的默认颜色
  newMaterial.specular = vec4.fromValues(0.6, 0.6, 0.6, 1);

  let newMaterial1 = new BlinnPhongMaterial('TestMaterial1', true);
  newMaterial1.shininess = 80;
  newMaterial1.diffuse = gltfRes.textures[0]; // 材质的默认颜色
  newMaterial1.ambient = gltfRes.textures[0]; // 材质的默认颜色
  newMaterial1.specular = vec4.fromValues(1, 1, 1, 1);

  let newMaterial2 = new BlinnPhongMaterial('TestMaterial2', true);
  newMaterial2.shininess = 6;
  newMaterial2.diffuse = gltfRes.textures[0]; // 材质的默认颜色
  newMaterial2.ambient = gltfRes.textures[0]; // 材质的默认颜色
  newMaterial2.specular = vec4.fromValues(0.2, 0.2, 0.2, 1);

  // 替换模型中的所有材质
  let meshes = gltfRes.meshes;
  for (let i = 0; i < meshes.length; i++) {
      let mesh = meshes[i];
      for (let j = 0; j < mesh.primitives.length; j++) {
        if(mesh._name === 'toubu' && j === 1){
          mesh.primitives[j].material = newMaterial1;
        }else if(mesh._name === 'shou' || mesh._name === 'shou001') {
          mesh.primitives[j].material = newMaterial2;
        }else {
          mesh.primitives[j].material = newMaterial;
        }
      }
  }

  let gltfNode = gltfRes.rootScene.nodes[0];
  gltfNode = gltfNode.clone();
  gltfNode.rotateByAngles(0, 180, 0);
  rootNode.addChild( gltfNode );

  // 获取动画信息
  const animations = gltfRes.animations;
  // 模型所在节点创建动画播放组件
  const animator = gltfNode.createAbility( AAnimation );
  // 将动画信息添加到播放组件中
  animations.forEach( clip => {
    animator.addAnimationClip( clip, clip.name );
  } );
  // 播放动画片段
  // animator.playAnimationClip('walk');

} );

// 启动引擎
engine.run();
