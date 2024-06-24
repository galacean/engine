/**
 * @title Gizmo
 * @category Toolkit
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*RdMcTqLMQtcAAAAAAAAAAAAADiR2AQ/original
 */

/**
 * 本示例展示如何使用Navigation Gizmo控制场景相机, 以及通过Gizmo控制物体移动、缩放、旋转
 */

import {
  Camera,
  Color,
  DirectLight,
  Entity,
  GLTFResource,
  Layer,
  PointerButton,
  Renderer,
  Script,
  ShadowType,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { LitePhysics } from "@galacean/engine-physics-lite";
import { FramebufferPicker, GridControl, NavigationGizmo, OrbitControl } from "@galacean/engine-toolkit";
import { AnchorType, CoordinateType, Gizmo, Group, State } from "@galacean/engine-toolkit-gizmo";
import * as dat from "dat.gui";

const LayerSetting = {
  Entity: Layer.Layer22,
  NavigationGizmo: Layer.Layer30,
  Gizmo: Layer.Layer31
};

const gui = new dat.GUI();
const traverseEntity = (entity: Entity, callback: (entity: Entity) => any) => {
  callback(entity);
  for (const child of entity.children) {
    traverseEntity(child, callback);
  }
};

// setup scene
WebGLEngine.create({
  canvas: "canvas",
  physics: new LitePhysics()
}).then((engine) => {
  engine.canvas.resizeByClientSize();
  const scene = engine.sceneManager.activeScene;
  const { background } = scene;
  background.solidColor = new Color(0.8, 0.8, 0.8, 1);
  const rootEntity = scene.createRootEntity();

  const cameraEntity = rootEntity.createChild("fullscreen-camera");
  const camera = cameraEntity.addComponent(Camera);
  cameraEntity.transform.setPosition(8, 5, 8);
  cameraEntity.transform.lookAt(new Vector3(0, 0, 0));
  camera.cullingMask &= ~LayerSetting.NavigationGizmo;

  const lightEntity = rootEntity.createChild("Light");
  lightEntity.transform.setPosition(20, 20, 20);
  lightEntity.transform.setRotation(-45, 0, 0);
  const light = lightEntity.addComponent(DirectLight);
  light.shadowType = ShadowType.None;

  const ambientLight = scene.ambientLight;
  ambientLight.diffuseSolidColor.set(0.8, 0.8, 1, 1);
  ambientLight.diffuseIntensity = 0.5;

  const grid = rootEntity.addComponent(GridControl);
  grid.camera = camera;
  grid.distance = 2;

  class ControlScript extends Script {
    public group = new Group();
    public gizmo: Gizmo;

    private _framebufferPicker: FramebufferPicker;
    private _orbitControl: OrbitControl;
    private _navigator: NavigationGizmo;

    constructor(entity: Entity) {
      super(entity);
      // add framebufferPicker
      this._framebufferPicker = cameraEntity.addComponent(FramebufferPicker);

      // add orbit control
      this._orbitControl = camera.entity.addComponent(OrbitControl);
      this._orbitControl.maxPolarAngle = Infinity;
      this._orbitControl.minPolarAngle = -Infinity;

      // add gizmo
      const gizmoEntity = entity.createChild("gizmo");
      const gizmo = gizmoEntity.addComponent(Gizmo);
      gizmo.init(camera, this.group);
      gizmo.state = State.scale;
      gizmo.layer = LayerSetting.Gizmo;
      this.gizmo = gizmo;

      gizmoEntity.isActive = false;

      // add navigation gizmo
      const navigatorEntity = entity.createChild("navigation-gizmo");
      this._navigator = navigatorEntity.addComponent(NavigationGizmo);
      this._navigator.camera = camera;
      this._navigator.layer = LayerSetting.NavigationGizmo;

      this._addGUI();
    }

    onUpdate(deltaTime: number): void {
      const { inputManager } = engine;
      const { pointers } = inputManager;

      // sharing same camera target
      this._navigator.target = this._orbitControl.target;

      // single select
      if (pointers && inputManager.isPointerDown(PointerButton.Primary)) {
        const { position } = pointers[0];
        this._framebufferPicker.pick(position.x, position.y).then((result) => {
          this._selectHandler(result);
        });
      }
    }

    // left mouse for single selection
    private _selectHandler(result: Renderer) {
      const selectedEntity = result?.entity;

      switch (selectedEntity?.layer) {
        case undefined: {
          this._orbitControl.enabled = true;
          this.group.reset();
          this.gizmo.entity.isActive = false;
          break;
        }
        case LayerSetting.Entity: {
          this._orbitControl.enabled = true;
          this.group.reset();
          this.group.addEntity(selectedEntity);
          this.gizmo.entity.isActive = true;
          break;
        }
        case LayerSetting.Gizmo: {
          this._orbitControl.enabled = false;
          break;
        }
      }
    }

    private _addGUI() {
      const info = {
        Gizmo: State.translate,
        Coordinate: CoordinateType.Local,
        Anchor: AnchorType.Center
      };
      const gizmoConfig = ["null", "translate", "rotate", "scale", "all"];
      const orientationConfig = ["global", "local"];
      const pivotConfig = ["center", "pivot"];

      gui
        .add(info, "Gizmo", gizmoConfig)
        .onChange((v: string) => {
          switch (v) {
            case "null":
              // @ts-ignore
              this.gizmo.state = null;
              break;
            case "translate":
              this.gizmo.state = State.translate;
              break;
            case "rotate":
              this.gizmo.state = State.rotate;
              break;
            case "scale":
              this.gizmo.state = State.scale;
              break;
            case "all":
              this.gizmo.state = State.all;
              break;
          }
        })
        .setValue("all");

      gui
        .add(info, "Coordinate", orientationConfig)
        .onChange((v: string) => {
          switch (v) {
            case "global":
              this.group.coordinateType = CoordinateType.Global;
              break;
            case "local":
              this.group.coordinateType = CoordinateType.Local;
              break;
          }
        })
        .setValue("local");

      gui
        .add(info, "Anchor", pivotConfig)
        .onChange((v: string) => {
          switch (v) {
            case "center":
              this.group.anchorType = AnchorType.Center;
              break;
            case "pivot":
              this.group.anchorType = AnchorType.Pivot;
              break;
          }
        })
        .setValue("center");
    }
  }

  const controlEntity = rootEntity.createChild("control");
  const sceneControl = controlEntity.addComponent(ControlScript);

  engine.resourceManager
    .load<GLTFResource>("https://mdn.alipayobjects.com/oasis_be/afts/file/A*AmbsSpS0IAcAAAAAAAAAAAAADkp5AQ/boxPBR.glb")
    .then((gltf) => {
      const { defaultSceneRoot } = gltf;
      rootEntity.addChild(defaultSceneRoot);
      defaultSceneRoot.transform.scale.set(0.01, 0.01, 0.01);
      traverseEntity(defaultSceneRoot, (entity) => {
        entity.layer = LayerSetting.Entity;
      });

      // init scene as selected state
      sceneControl.group.reset();
      sceneControl.group.addEntity(defaultSceneRoot);
      sceneControl.gizmo.entity.isActive = true;
    })
    .then(() => {
      engine.run();
    });
});
