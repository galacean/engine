import { Engine, LambertMaterial } from "@alipay/o3-plus";
import { PerspectiveCamera, OrthographicCamera } from "@alipay/o3-plus";
import { AGeometryRenderer } from "@alipay/o3-plus";
import { CuboidGeometry, ADirectLight, AOrbitControls, NodeAbility } from "@alipay/o3-plus";
import * as dat from "dat.gui";

let engine = new Engine();
let scene = engine.currentScene;
let rootNode = scene.root;

function createSphereGeometry(name, position) {
  const obj = rootNode.createChild(name);
  obj.position = position;
  let renderer = obj.createAbility(AGeometryRenderer);
  renderer.geometry = new CuboidGeometry(2, 2, 2);
  const material = new LambertMaterial("lambert");
  renderer.material = material;

  const ability = obj.createAbility(NodeAbility);
  ability.onUpdate = () => {
    obj.rotateByAngles(0, 1, 0);
  };
}

createSphereGeometry("obj1", [0, 0, 0]);

let cameraNode = rootNode.createChild("camera_node");
let orthographicCamera = cameraNode.createAbility(OrthographicCamera);
orthographicCamera.attachToScene("o3-demo");
cameraNode.position = [7, 8, 20];
cameraNode.createAbility(ADirectLight);
orthographicCamera.top = 8;
orthographicCamera.bottom = -8;
orthographicCamera.left = -8;
orthographicCamera.right = 8;
orthographicCamera.node.lookAt([0, 0, 0], [0, 1, 0]);

let perspectiveCamera = cameraNode.createAbility(PerspectiveCamera);
perspectiveCamera.attachToScene("o3-demo");
perspectiveCamera.enabled = false;

const gui = new dat.GUI();
gui.domElement.style = "position:absolute;top:0px;left:50vw";
let orthgraphicFolder = gui.addFolder("orthographicCamera");
orthgraphicFolder.add(orthographicCamera, "enabled");
orthgraphicFolder.add(orthographicCamera, "left", -1000, 0);
orthgraphicFolder.add(orthographicCamera, "right", 0, 1000);
orthgraphicFolder.add(orthographicCamera, "top", 0, 1000);
orthgraphicFolder.add(orthographicCamera, "bottom", -1000, 0);

let perspectiveFolder = gui.addFolder("perspectiveCamera");
perspectiveFolder.add(perspectiveCamera, "enabled");
perspectiveFolder.add(perspectiveCamera, "fov", 0, 180);
//-- run
engine.run();
