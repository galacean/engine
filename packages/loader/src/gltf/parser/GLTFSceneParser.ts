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
  Mesh,
  MeshRenderer,
  ModelMesh,
  Skin,
  SkinnedMeshRenderer
} from "@galacean/engine-core";
import { BoundingBox, Matrix } from "@galacean/engine-math";
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
      const glTFPrimitive = glTFMeshPrimitives[i];
      const mesh = meshes[meshID][i];
      let renderer: MeshRenderer | SkinnedMeshRenderer;

      if (skinID !== undefined || blendShapeWeights) {
        context.hasSkinned = true;
        const skinRenderer = entity.addComponent(SkinnedMeshRenderer);
        skinRenderer.mesh = mesh;
        if (skinID !== undefined) {
          const skin = skins[skinID];
          skinRenderer.rootBone = skin._rootBone;
          skinRenderer.bones = skin._bones;
          this._computeLocalBounds(skinRenderer, mesh, skin._bones, skin._rootBone, skin.inverseBindMatrices);

          skinRenderer.skin = skin;
        }
        if (blendShapeWeights) {
          skinRenderer.blendShapeWeights = new Float32Array(blendShapeWeights);
        }
        renderer = skinRenderer;
      } else {
        renderer = entity.addComponent(MeshRenderer);
        renderer.mesh = mesh;
      }

      const materialIndex = glTFPrimitive.material;
      const material = materials?.[materialIndex] || GLTFSceneParser._getDefaultMaterial(engine);
      renderer.setMaterial(material);

      // Enable vertex color if mesh has COLOR_0 vertex element
      mesh.vertexElements.forEach((element) => {
        if (element.semantic === "COLOR_0") {
          renderer.enableVertexColor = true;
        }
      });

      GLTFParser.executeExtensionsAdditiveAndParse(glTFPrimitive.extensions, context, renderer, glTFPrimitive);
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

  private _computeLocalBounds(
    skinnedMeshRenderer: SkinnedMeshRenderer,
    mesh: Mesh,
    bones: Entity[],
    rootBone: Entity,
    inverseBindMatrices: Matrix[]
  ): void {
    const rootBoneIndex = bones.indexOf(rootBone);
    if (rootBoneIndex !== -1) {
      BoundingBox.transform(mesh.bounds, inverseBindMatrices[rootBoneIndex], skinnedMeshRenderer.localBounds);
    } else {
      // Root bone is not in joints list, we can only compute approximate inverse bind matrix
      // Average all root bone's children inverse bind matrix
      const approximateBindMatrix = new Matrix(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
      let subRootBoneCount = this._computeApproximateBindMatrix(
        bones,
        inverseBindMatrices,
        rootBone,
        approximateBindMatrix
      );

      if (subRootBoneCount !== 0) {
        Matrix.multiplyScalar(approximateBindMatrix, 1.0 / subRootBoneCount, approximateBindMatrix);
        BoundingBox.transform(mesh.bounds, approximateBindMatrix, skinnedMeshRenderer.localBounds);
      } else {
        skinnedMeshRenderer.localBounds.copyFrom(mesh.bounds);
      }
    }
  }

  private _computeApproximateBindMatrix(
    jointEntities: Entity[],
    inverseBindMatrices: Matrix[],
    rootEntity: Entity,
    approximateBindMatrix: Matrix
  ): number {
    let subRootBoneCount = 0;
    const children = rootEntity.children;
    for (let i = 0, n = children.length; i < n; i++) {
      const rootChild = children[i];
      const index = jointEntities.indexOf(rootChild);
      if (index !== -1) {
        Matrix.add(approximateBindMatrix, inverseBindMatrices[index], approximateBindMatrix);
        subRootBoneCount++;
      } else {
        subRootBoneCount += this._computeApproximateBindMatrix(
          jointEntities,
          inverseBindMatrices,
          rootChild,
          approximateBindMatrix
        );
      }
    }

    return subRootBoneCount;
  }
}
