import { Engine } from "@alipay/o3-core";
import { Logger, TextureFilter, TextureWrapMode } from "@alipay/o3-base";
import { ADefaultCamera } from "@alipay/o3-default-camera";
import { ARfuiRenderer } from "@alipay/o3-rfui";
import { Texture2D } from "@alipay/o3-material";
import "@alipay/o3-engine-stats";
import { ResourceLoader, Resource } from "@alipay/o3-loader";

Logger.enable();
//-- create engine object
let engine = new Engine();
let scene = engine.currentScene;
let rootNode = scene.root;

// 创建资源对象，参数分别为对象名，资源类型，资源路径
const res = [];
res.push(
  new Resource("img", {
    type: "texture",
    url: "https://gw.alipayobjects.com/zos/rmsportal/QzfBjcWFaJsojRKUtivK.png"
  })
);
res.push(
  new Resource("img", {
    type: "texture",
    url: "https://gw.alipayobjects.com/zos/rmsportal/hxiMCvMgGJBnPxMpMEHC.jpeg"
  })
);

const resourceLoader = new ResourceLoader(engine);
let tweener: any = {};
resourceLoader.batchLoad(res, (err, res) => {
  if (err) return console.error(err);

  const animationManager = createPlaneGeometry("obj1", [0, 0, 0], [0, 0, 0], 4, 3, 1, 1, res[0].asset, res[1].asset);
  setTimeout(() => {
    // tweener =animationManager.scaleIn()

    // tweener =animationManager.scaleXIn()

    // tweener =animationManager.scaleYIn()

    // tweener =animationManager.translateIn({
    //   start:[2, 3, 0]
    // })

    // tweener =animationManager.rotateIn()

    // tweener =animationManager.fadeIn()

    // tweener =animationManager.slideIn()

    tweener = animationManager.maskSlideIn();
  }, 2000);

  setTimeout(() => {
    tweener.stop();

    // animationManager.scaleOut()

    // animationManager.scaleXOut()

    // animationManager.scaleYOut()

    // animationManager.translateOut({
    //   end:[2, 3, 0]
    // })

    // animationManager.rotateOut()

    // animationManager.fadeOut()

    // animationManager.slideOut()
    animationManager.maskSlideOut();
  }, 2200);

  engine.run();
});

let cameraNode = rootNode.createChild("camera_node");
let camera = cameraNode.createAbility(ADefaultCamera, {
  canvas: "o3-demo",
  position: [0, 0, 10],
  pixelRatio: 2
});

function createPlaneGeometry(name, position, rotation, w, h, hs, vs, texture1, texture2) {
  let obj = rootNode.createChild(name);
  obj.scale = [w, h, 1];
  obj.setRotationAngles(rotation[0], rotation[1], rotation[2]);
  let cubeRenderer = obj.createAbility(ARfuiRenderer, {
    diffuse: texture1,
    mask: texture2
  });

  const animationManager = cubeRenderer.animationManager;

  return animationManager;
}
