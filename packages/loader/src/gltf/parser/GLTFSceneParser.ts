import {
  AnimationClip,
  Animator,
  AnimatorController,
  AnimatorControllerLayer,
  AnimatorStateMachine,
  BlinnPhongMaterial,
  Camera,
  Engine,
  Entity,
  Material,
  MeshRenderer,
  ModelMesh,
  Skin,
  SkinnedMeshRenderer
} from "@galacean/engine-core";
import { GLTFResource } from "../GLTFResource";
import { CameraType, ICamera, INode } from "../GLTFSchema";
import { GLTFParser } from "./GLTFParser";
import { GLTFParserContext, GLTFParserType, registerGLTFParser } from "./GLTFParserContext";

@registerGLTFParser(GLTFParserType.Scene)
export class GLTFSceneParser extends GLTFParser {
  private static _defaultMaterial: BlinnPhongMaterial;

  private static _getDefaultMaterial(engine: Engine): BlinnPhongMaterial {
    if (!GLTFSceneParser._defaultMaterial) {
      GLTFSceneParser._defaultMaterial = new BlinnPhongMaterial(engine);
    }

    return GLTFSceneParser._defaultMaterial;
  }

  parse(context: GLTFParserContext): Promise<Entity> {
    const { glTFResource, glTF } = context;
    const { nodes, cameras } = glTF;

    if (!nodes) return Promise.resolve(null);

    return Promise.all([
      context.get<Entity[]>(GLTFParserType.Entity),
      context.get<ModelMesh[][]>(GLTFParserType.Mesh),
      context.get<Skin[]>(GLTFParserType.Skin),
      context.get<Material[]>(GLTFParserType.Material),
      context.get<AnimationClip[]>(GLTFParserType.Animation)
    ]).then(([entities, meshes, skins, materials, animations]) => {
      this._buildEntityTree(context, entities);
      this._createSceneRoots(context, entities);

      for (let i = 0; i < nodes.length; i++) {
        const glTFNode = nodes[i];
        const { camera: cameraID, mesh: meshID, extensions } = glTFNode;

        const entity = entities[i];

        if (cameraID !== undefined) {
          this._createCamera(glTFResource, cameras[cameraID], entity);
        }

        if (meshID !== undefined) {
          this._createRenderer(context, glTFNode, entity, meshes, skins, materials);
        }

        GLTFParser.executeExtensionsAdditiveAndParse(extensions, context, entity, glTFNode);
      }

      if (glTFResource.defaultSceneRoot) {
        this._createAnimator(context, animations);
      }

      return glTFResource.defaultSceneRoot;
    });
  }

  private _createCamera(resource: GLTFResource, cameraSchema: ICamera, entity: Entity): void {
    const { orthographic, perspective, type } = cameraSchema;
    const camera = entity.addComponent(Camera);

    if (type === CameraType.ORTHOGRAPHIC) {
      const { xmag, ymag, zfar, znear } = orthographic;

      camera.isOrthographic = true;

      if (znear !== undefined) {
        camera.nearClipPlane = znear;
      }
      if (zfar !== undefined) {
        camera.farClipPlane = zfar;
      }

      camera.orthographicSize = Math.max(ymag ?? 0, xmag ?? 0) / 2;
    } else if (type === CameraType.PERSPECTIVE) {
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

    if (!resource.cameras) resource.cameras = [];
    resource.cameras.push(camera);
    // @todo: use engine camera by default
    camera.enabled = false;
  }

  private _createRenderer(
    context: GLTFParserContext,
    glTFNode: INode,
    entity: Entity,
    meshes: ModelMesh[][],
    skins: Skin[],
    materials: Material[]
  ) {
    const { glTFResource, glTF } = context;
    const { meshes: glTFMeshes } = glTF;
    const engine = glTFResource.engine;
    const { mesh: meshID, skin: skinID } = glTFNode;
    const glTFMesh = glTFMeshes[meshID];
    const glTFMeshPrimitives = glTFMesh.primitives;
    const blendShapeWeights = glTFNode.weights || glTFMesh.weights;

    for (let i = 0; i < glTFMeshPrimitives.length; i++) {
      const gltfPrimitive = glTFMeshPrimitives[i];
      const mesh = meshes[meshID][i];
      let renderer: MeshRenderer | SkinnedMeshRenderer;

      if (skinID !== undefined || blendShapeWeights) {
        context.hasSkinned = true;
        const skinRenderer = entity.addComponent(SkinnedMeshRenderer);
        skinRenderer.mesh = mesh;
        if (skinID !== undefined) {
          skinRenderer.skin = skins[skinID];
        }
        if (blendShapeWeights) {
          skinRenderer.blendShapeWeights = new Float32Array(blendShapeWeights);
        }
        renderer = skinRenderer;
      } else {
        renderer = entity.addComponent(MeshRenderer);
        renderer.mesh = mesh;
      }

      const materialIndex = gltfPrimitive.material;
      const material = materials?.[materialIndex] || GLTFSceneParser._getDefaultMaterial(engine);
      renderer.setMaterial(material);

      // Enable vertex color if mesh has COLOR_0 vertex element
      mesh.vertexElements.forEach((element) => {
        if (element.semantic === "COLOR_0") {
          renderer.enableVertexColor = true;
        }
      });

      GLTFParser.executeExtensionsAdditiveAndParse(gltfPrimitive.extensions, context, renderer, gltfPrimitive);
    }
  }

  private _createAnimator(context: GLTFParserContext, animations: AnimationClip[]): void {
    if (!context.hasSkinned && !animations) {
      return;
    }

    const defaultSceneRoot = context.glTFResource.defaultSceneRoot;
    const animator = defaultSceneRoot.addComponent(Animator);
    const animatorController = new AnimatorController();
    const layer = new AnimatorControllerLayer("layer");
    const animatorStateMachine = new AnimatorStateMachine();
    animatorController.addLayer(layer);
    animator.animatorController = animatorController;
    layer.stateMachine = animatorStateMachine;
    if (animations) {
      for (let i = 0; i < animations.length; i++) {
        const animationClip = animations[i];
        const name = animationClip.name;
        const uniqueName = animatorStateMachine.makeUniqueStateName(name);
        if (uniqueName !== name) {
          console.warn(`AnimatorState name is existed, name: ${name} reset to ${uniqueName}`);
        }
        const animatorState = animatorStateMachine.addState(uniqueName);
        animatorState.clip = animationClip;
      }
    }
  }

  private _buildEntityTree(context: GLTFParserContext, entities: Entity[]): void {
    const {
      glTF: { nodes }
    } = context;

    for (let i = 0; i < nodes.length; i++) {
      const { children } = nodes[i];
      const entity = entities[i];

      if (children) {
        for (let j = 0; j < children.length; j++) {
          const childEntity = entities[children[j]];

          entity.addChild(childEntity);
        }
      }
    }
  }

  private _createSceneRoots(context: GLTFParserContext, entities: Entity[]): void {
    const { glTFResource, glTF } = context;
    const { scene: sceneID = 0, scenes } = glTF;

    if (!scenes) return;

    const sceneRoots: Entity[] = [];

    for (let i = 0; i < scenes.length; i++) {
      const { nodes } = scenes[i];

      if (!nodes) continue;

      if (nodes.length === 1) {
        sceneRoots[i] = entities[nodes[0]];
      } else {
        const rootEntity = new Entity(glTFResource.engine, "GLTF_ROOT");
        for (let j = 0; j < nodes.length; j++) {
          rootEntity.addChild(entities[nodes[j]]);
        }
        sceneRoots[i] = rootEntity;
      }
    }

    glTFResource.sceneRoots = sceneRoots;
    glTFResource.defaultSceneRoot = sceneRoots[sceneID];
  }
}
