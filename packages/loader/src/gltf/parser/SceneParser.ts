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
import { IKHRLightsPunctual, IKHRLightsPunctual_LightNode } from "../extensions/Schema";
import { GLTFResource } from "../GLTFResource";
import { ICamera, INode } from "../Schema";
import { Parser } from "./Parser";

export class SceneParser extends Parser {
  private static _defaultMaterial: BlinnPhongMaterial;

  private static _getDefaultMaterial(engine: Engine): BlinnPhongMaterial {
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
      const { camera: cameraID, mesh: meshID, extensions = {} } = gltfNode;
      const { KHR_lights_punctual } = extensions;
      const entity = entities[i];

      if (cameraID !== undefined) {
        this._createCamera(context, gltfCameras[cameraID], entity);
      }

      if (meshID !== undefined) {
        this._createRenderer(context, gltfNode, entity);
      }

      if (KHR_lights_punctual) {
        const lightIndex = (KHR_lights_punctual as IKHRLightsPunctual_LightNode).light;
        const lights = (context.gltf.extensions.KHR_lights_punctual as IKHRLightsPunctual).lights;

        Parser.parseEngineResource("KHR_lights_punctual", lights[lightIndex], entity, context);
      }
    }

    this._createSceneRoots(context);

    if (context.defaultSceneRoot) {
      this._createAnimator(context);
    }
  }

  private _createCamera(context: GLTFResource, cameraSchema: ICamera, entity: Entity): void {
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
        camera.fieldOfView = (yfov * 180) / Math.PI;
      }
      if (zfar !== undefined) {
        camera.farClipPlane = zfar;
      }
      if (znear !== undefined) {
        camera.nearClipPlane = znear;
      }
    }

    if (!context.cameras) context.cameras = [];
    context.cameras.push({
      entity,
      camera
    });
    // @todo: use engine camera by default
    camera.enabled = false;
  }

  private _createRenderer(context: GLTFResource, gltfNode: INode, entity: Entity): void {
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

    for (let i = 0; i < gltfMeshPrimitives.length; i++) {
      const mesh = meshes[meshID][i];
      let renderer: MeshRenderer | SkinnedMeshRenderer;

      if (skinID !== undefined) {
        const skin = skins[skinID];
        const skinRenderer = entity.addComponent(SkinnedMeshRenderer);
        skinRenderer.mesh = mesh;
        skinRenderer.skin = skin;
        renderer = skinRenderer;
      } else {
        renderer = entity.addComponent(MeshRenderer);
        renderer.mesh = mesh;
      }

      const materialIndex = gltfMeshPrimitives[i].material;
      const material = materials?.[materialIndex] || SceneParser._getDefaultMaterial(engine);
      renderer.setMaterial(material);

      const { extensions = {} } = gltfMeshPrimitives[i];
      const { KHR_materials_variants } = extensions;
      if (KHR_materials_variants) {
        Parser.parseEngineResource("KHR_materials_variants", KHR_materials_variants, renderer, context);
      }
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
    context.defaultSceneRoot = sceneRoots[sceneID ?? 0];
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
