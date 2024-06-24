/**
 * @title Framebuffer Picker
 * @category Toolkit
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*xk9IQqUAigEAAAAAAAAAAAAADiR2AQ/original
 */
import {
  Camera,
  PBRMaterial,
  PointerButton,
  Script,
  Vector3,
  WebGLEngine,
  PrimitiveMesh,
  MeshRenderer,
  AmbientLight,
  AssetType,
  Vector2,
  Layer,
} from "@galacean/engine";
import {
  FramebufferPicker,
  OutlineManager,
  LineDrawer,
} from "@galacean/engine-toolkit";

WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();
  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();
  scene.ambientLight.diffuseSolidColor.set(1, 1, 1, 1);

  const cameraEntity = rootEntity.createChild("camera_node");
  const camera = cameraEntity.addComponent(Camera);
  cameraEntity.transform.position = new Vector3(0, 0, 30);

  const mesh = PrimitiveMesh.createCuboid(engine);
  for (let i = 0; i < 100; i++) {
    const entity = rootEntity.createChild();
    entity.layer = Layer.Layer1;

    entity.transform.setPosition(
      Math.random() * 80 - 40,
      Math.random() * 45 - 25,
      Math.random() * 45 - 25
    );
    entity.transform.setRotation(
      Math.random() * 180,
      Math.random() * 180,
      Math.random() * 180
    );
    entity.transform.setScale(
      Math.random() * 2 + 1,
      Math.random() * 2 + 1,
      Math.random() * 2 + 1
    );

    const render = entity.addComponent(MeshRenderer);
    render.mesh = mesh;
    const mtl = new PBRMaterial(engine);
    mtl.metallic = 0.0;
    mtl.roughness = 0.5;
    mtl.baseColor.set(Math.random(), Math.random(), Math.random(), 1.0);

    render.setMaterial(mtl);
  }

  const outlineManager = cameraEntity.addComponent(OutlineManager);

  const framebufferPicker = cameraEntity.addComponent(FramebufferPicker);
  const { width, height } = engine.canvas;
  framebufferPicker.frameBufferSize = new Vector2(width, height);

  const boxBorderEntity = rootEntity.createChild("line");
  boxBorderEntity.addComponent(MeshRenderer);
  boxBorderEntity.addComponent(LineDrawer);

  class ClickScript extends Script {
    public depth: number = 0.1;
    private _startPoint: Vector2 = new Vector2();
    private _endPoint: Vector2 = new Vector2();

    private _tempVec0: Vector3 = new Vector3();
    private _tempVec1: Vector3 = new Vector3();
    private _tempVec2: Vector3 = new Vector3();
    private _tempVec3: Vector3 = new Vector3();

    getRectVertex(from: Vector2, to: Vector2) {
      this._tempVec0.set(from.x, from.y, this.depth);
      this._tempVec1.set(to.x, from.y, this.depth);
      this._tempVec2.set(to.x, to.y, this.depth);
      this._tempVec3.set(from.x, to.y, this.depth);

      camera.screenToWorldPoint(this._tempVec0, this._tempVec0);
      camera.screenToWorldPoint(this._tempVec1, this._tempVec1);
      camera.screenToWorldPoint(this._tempVec2, this._tempVec2);
      camera.screenToWorldPoint(this._tempVec3, this._tempVec3);
    }

    onUpdate(): void {
      const inputManager = this.engine.inputManager;
      const { pointers } = inputManager;
      if (pointers && inputManager.isPointerDown(PointerButton.Primary)) {
        if (pointers.length > 0) {
          this._startPoint.copyFrom(pointers[0].position);

          // single selection
          framebufferPicker
            .pick(this._startPoint.x, this._startPoint.y)
            .then((renderer) => {
              if (!renderer || !renderer.entity) {
                outlineManager.clear();
                return;
              }
              if (renderer.entity.layer === Layer.Layer1) {
                outlineManager.addEntity(renderer.entity);
              }
            });
        }
      }

      if (pointers && inputManager.isPointerHeldDown(PointerButton.Primary)) {
        if (pointers.length > 0) {
          this._endPoint.copyFrom(pointers[0].position);
          this.getRectVertex(this._startPoint, this._endPoint);

          // multi selection
          LineDrawer.drawRect(
            this._tempVec0,
            this._tempVec1,
            this._tempVec2,
            this._tempVec3
          );

          framebufferPicker
            .regionPick(
              this._startPoint.x,
              this._startPoint.y,
              this._endPoint.x,
              this._endPoint.y
            )
            .then((renderers) => {
              renderers.forEach((value) => {
                if (value.entity.layer === Layer.Layer1) {
                  outlineManager.addEntity(value.entity);
                }
              });
            });
        }
      }
    }
  }

  cameraEntity.addComponent(ClickScript);

  engine.resourceManager
    .load<AmbientLight>({
      type: AssetType.Env,
      url: "https://gw.alipayobjects.com/os/bmw-prod/89c54544-1184-45a1-b0f5-c0b17e5c3e68.bin",
    })
    .then((ambientLight) => {
      scene.ambientLight = ambientLight;
      engine.run();
    });
});
