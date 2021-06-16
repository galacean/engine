import { Camera, Entity, WebGLEngine } from "oasis-engine";
import { OrthoControl } from "../src/OrthoControl";

const canvasDOM = document.createElement("canvas");
canvasDOM.width = 1024;
canvasDOM.height = 1024;

describe(" Ortho Control", () => {
  let entity: Entity;
  let camera: Camera;
  let cameraControl: OrthoControl;

  beforeAll(() => {
    const engine = new WebGLEngine(canvasDOM);
    entity = engine.sceneManager.activeScene.createRootEntity();
    camera = entity.addComponent(Camera);
    cameraControl = entity.addComponent(OrthoControl);
  });

  it("test zoom", () => {
    cameraControl.zoomIn();
    cameraControl.onUpdate(0);
    expect(camera.orthographicSize).toEqual(8.749999999999998);
    cameraControl.zoomOut();
    cameraControl.onUpdate(0);
    expect(camera.orthographicSize).toEqual(10.065789473684207);
  });

  it("test pan", () => {
    cameraControl.panStart(0, 0);
    cameraControl.panMove(2, 0);
    cameraControl.onUpdate(0);
    cameraControl.panEnd();

    const pos = entity.transform.position;
    expect(pos.x).toEqual(-0.039319490131578934);
    expect(pos.y).toEqual(0);
  });
});
