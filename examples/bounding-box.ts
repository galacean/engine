/**
 * @title Bounding Box
 * @category Advance
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*QxgsR4ScBPwAAAAAAAAAAAAADiR2AQ/original
 */
import {
  BoundingBox,
  Camera,
  DirectLight,
  Entity,
  GLTFResource,
  MeshRenderer,
  PBRMaterial,
  PrimitiveMesh,
  Script,
  SkinnedMeshRenderer,
  Vector3,
  WebGLEngine,
} from '@galacean/engine';

WebGLEngine.create({ canvas: 'canvas' }).then((engine) => {
  engine.canvas.resizeByClientSize();

  const rootEntity = engine.sceneManager.activeScene.createRootEntity();

  const cameraEntity = rootEntity.createChild('camera');
  cameraEntity.addComponent(Camera);
  cameraEntity.transform.setPosition(0, 0, 10);
  engine.sceneManager.activeScene.ambientLight.diffuseSolidColor.set(
    1,
    1,
    1,
    1
  );
  const lightEntity = rootEntity.createChild('DirectLight');
  lightEntity.addComponent(DirectLight);
  lightEntity.transform.setPosition(3, 3, 3);
  lightEntity.transform.lookAt(new Vector3(0, 0, 0));

  class MoveScript extends Script {
    private _rotation = 0;
    private _boxEntity: Entity;
    private _boundingBox: BoundingBox = new BoundingBox();
    private _centerVec: Vector3 = new Vector3();
    private _extentVec: Vector3 = new Vector3();
    private _tempVec: Vector3 = new Vector3();

    onStart() {
      const boxEntity = (this._boxEntity = rootEntity.createChild('box'));
      const boxRenderer = boxEntity.addComponent(MeshRenderer);
      boxRenderer.mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);
      const material = new PBRMaterial(engine);
      material.baseColor.set(0xaa / 0xff, 0x3e / 0xff, 0x53 / 0xff, 0.6);
      material.isTransparent = true;
      boxRenderer.setMaterial(material);
    }

    onUpdate(deltaTime: number): void {
      const rotation = (++this._rotation / 180) * Math.PI;
      const { transform } = this.entity;
      transform.rotate(this._tempVec.set(1, 1, 1));
      transform.setPosition(Math.sin(rotation), Math.cos(rotation), 0);
    }

    onLateUpdate(deltaTime: number): void {
      const renderers: SkinnedMeshRenderer[] =
        this.entity.getComponentsIncludeChildren(SkinnedMeshRenderer, []);
      const length = renderers.length;
      if (length > 0) {
        const {
          _extentVec: extentVec,
          _centerVec: centerVec,
          _boundingBox: boundingBox,
        } = this;
        boundingBox.copyFrom(renderers[0].bounds);
        for (let i = 1; i < length; i++) {
          BoundingBox.merge(boundingBox, renderers[i].bounds, boundingBox);
        }
        const { transform } = this._boxEntity;
        boundingBox.getExtent(extentVec).scale(2);
        boundingBox.getCenter(centerVec);
        transform.worldPosition = centerVec;
        transform.scale = extentVec;
      }
    }
  }

  engine.resourceManager
    .load<GLTFResource>(
      'https://gw.alipayobjects.com/os/bmw-prod/5e3c1e4e-496e-45f8-8e05-f89f2bd5e4a4.glb'
    )
    .then((glTF) => {
      const glTFEntity = glTF.defaultSceneRoot;
      glTFEntity.addComponent(MoveScript);
      rootEntity.addChild(glTFEntity);
    });

  engine.run();
});
