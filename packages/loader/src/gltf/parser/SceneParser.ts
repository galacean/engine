import {
  Animation,
  BlinnPhongMaterial,
  Camera,
  Engine,
  Entity,
  Logger,
  MeshRenderer,
  SkinnedMeshRenderer
} from "@oasis-engine/core";
import { Color } from "@oasis-engine/math";
import { GLTFResource } from "../GLTFResource";
import { ICamera, INode } from "../schema";
import { Parser } from "./Parser";

export class SceneParser extends Parser {
  private static _defaultMaterial: BlinnPhongMaterial;

  private static _getDefaultMaterial(engine: Engine) {
    if (!SceneParser._defaultMaterial) {
      SceneParser._defaultMaterial = new BlinnPhongMaterial(engine);
      SceneParser._defaultMaterial.emissiveColor = new Color(0.749, 0.749, 0.749, 1);
    }

    return SceneParser._defaultMaterial;
  }

  parse(context: GLTFResource): void {
    const {
      gltf: { nodes, cameras: gltfCameras },
      entities
    } = context;

    if (!nodes) return;

    for (let i = 0; i < nodes.length; i++) {
      const gltfNode = nodes[i];
      const { camera: cameraID, mesh: meshID } = gltfNode;
      const entity = entities[i];

      if (cameraID !== undefined) {
        const camera = this._createCamera(gltfCameras[cameraID], entity);
        if (!context.cameras) context.cameras = [];
        context.cameras.push(camera);
      }

      if (meshID !== undefined) {
        this._createRenderer(gltfNode, context, entity);
      }
    }

    this._createSceneRoots(context);

    if (context.defaultSceneRoot) {
      this._createAnimator(context);
    }
  }

  private _createCamera(cameraSchema: ICamera, entity: Entity): Camera {
    const { orthographic, perspective, type, name } = cameraSchema;
    const camera = entity.addComponent(Camera);

    if (type === "orthographic") {
      const { xmag, ymag, zfar, znear } = orthographic;

      camera.isOrthographic = true;

      if (znear !== undefined) {
        camera.nearClipPlane = znear;
      }
      if (zfar !== undefined) {
        camera.farClipPlane = zfar;
      }

      camera.orthographicSize = Math.max(ymag ?? 0, xmag ?? 0) / 2;
    } else if (type === "perspective") {
      const { aspectRatio, yfov, zfar, znear } = perspective;

      if (aspectRatio !== undefined) {
        camera.aspectRatio = aspectRatio;
      }
      if (yfov !== undefined) {
        camera.fieldOfView = yfov;
      }
      if (zfar !== undefined) {
        camera.farClipPlane = zfar;
      }
      if (znear !== undefined) {
        camera.nearClipPlane = znear;
      }
    }

    return camera;
  }

  private _createRenderer(gltfNode: INode, context: GLTFResource, entity: Entity): void {
    const {
      engine,
      gltf: { meshes: gltfMeshes },
      meshes,
      materials,
      skins
    } = context;
    const { mesh: meshID, skin: skinID, weights } = gltfNode;

    if (weights) {
      Logger.error("Sorry, morph animation is not supported now, wait please.");
    }

    const gltfMeshPrimitives = gltfMeshes[meshID].primitives;

    for (let j = 0; j < gltfMeshPrimitives.length; j++) {
      const mesh = meshes[meshID][j];
      let renderer: MeshRenderer;

      if (skinID !== undefined) {
        const skin = skins[skinID];
        const skinRenderer: SkinnedMeshRenderer = entity.addComponent(SkinnedMeshRenderer);
        skinRenderer.mesh = mesh;
        skinRenderer.skin = skin;
        renderer = skinRenderer;
      } else {
        renderer = entity.addComponent(MeshRenderer);
        renderer.mesh = mesh;
      }

      const materialIndex = gltfMeshPrimitives[j].material;
      const material = materials?.[materialIndex] || SceneParser._getDefaultMaterial(engine);
      renderer.setMaterial(material);
    }
  }

  private _createSceneRoots(context: GLTFResource): void {
    const {
      engine,
      gltf: { scene: sceneID, scenes },
      entities
    } = context;

    if (!scenes) return;

    const sceneRoots: Entity[] = [];

    for (let i = 0; i < scenes.length; i++) {
      const { nodes } = scenes[i];

      if (!nodes) continue;

      if (nodes.length === 1) {
        sceneRoots[i] = entities[nodes[0]];
      } else {
        const rootEntity = new Entity(engine, "GLTF_ROOT");
        for (let j = 0; j < nodes.length; j++) {
          rootEntity.addChild(entities[nodes[j]]);
        }
        sceneRoots[i] = rootEntity;
      }
    }

    context.sceneRoots = sceneRoots;
    context.defaultSceneRoot = sceneRoots[sceneID];
  }

  private _createAnimator(context: GLTFResource) {
    const { defaultSceneRoot, animations } = context;

    if (!animations) return;

    const animator = defaultSceneRoot.addComponent(Animation);

    for (let i = 0; i < animations.length; i++) {
      const animationClip = animations[i];
      animator.addAnimationClip(animationClip, animationClip.name);
    }
  }
}
