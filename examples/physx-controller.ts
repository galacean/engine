/**
 * @title PhysX Character Controller
 * @category Physics
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*guHUSbk6THIAAAAAAAAAAAAADiR2AQ/original
 */

import { OrbitControl } from "@galacean/engine-toolkit-controls";
import { PhysXPhysics } from "@galacean/engine-physics-physx";
import {
  AmbientLight,
  AnimationClip,
  Animator,
  AnimatorStateMachine,
  AssetType,
  BackgroundMode,
  BoxColliderShape,
  Camera,
  CapsuleColliderShape,
  CharacterController,
  Color,
  ControllerCollisionFlag,
  DirectLight,
  Engine,
  Entity,
  Font,
  GLTFResource,
  Keys,
  Logger,
  Material,
  Matrix,
  MeshRenderer,
  PBRMaterial,
  PlaneColliderShape,
  PrimitiveMesh,
  Quaternion,
  RenderFace,
  Script,
  ShadowType,
  SkyBoxMaterial,
  StaticCollider,
  TextRenderer,
  Texture2D,
  Vector2,
  Vector3,
  WebGLEngine,
} from "@galacean/engine";

Logger.enable();

enum State {
  Run = "Run",
  Idle = "Idle",
  Jump = "Jump_In",
  Fall = "Fall",
  Landing = "Landing",
}

class AnimationState {
  private _state: State = State.Idle;
  private _lastKey: Keys = null;

  get state(): State {
    return this._state;
  }

  setMoveKey(value: Keys) {
    this._lastKey = value;
    if (this._state === State.Fall || this._state === State.Jump) {
      return;
    }

    if (
      this._lastKey === null &&
      (this._state === State.Run || this._state === State.Idle)
    ) {
      this._state = State.Idle;
    } else {
      this._state = State.Run;
    }
  }

  setJumpKey() {
    this._state = State.Jump;
  }

  setFallKey() {
    this._state = State.Fall;
  }

  setIdleKey() {
    if (this._state == State.Jump) {
      return;
    }

    if (this._state === State.Fall) {
      this._state = State.Landing;
    }

    if (this._state === State.Landing) {
      this._state = State.Idle;
    }
  }
}

class ControllerScript extends Script {
  _camera: Entity;
  _character: Entity;
  _controller: CharacterController;
  _animator: Animator;

  _displacement = new Vector3();
  _forward = new Vector3();
  _cross = new Vector3();
  _lastKey = true;

  _predictPosition = new Vector3();
  _rotMat = new Matrix();
  _rotation = new Quaternion();
  _newRotation = new Quaternion();
  _yAxisMove = new Vector3();
  _up = new Vector3(0, 1, 0);

  _animationState = new AnimationState();
  _animationName: State;
  _fallAccumulateTime = 0;

  onAwake() {
    this._controller = this.entity.getComponent(CharacterController);
  }

  targetCamera(camera: Entity) {
    this._camera = camera;
  }

  targetCharacter(character: Entity) {
    this._character = character;
    this._animator = character.getComponent(Animator);
  }

  onUpdate(deltaTime: number) {
    const inputManager = this.engine.inputManager;
    if (inputManager.isKeyHeldDown()) {
      this._forward.copyFrom(this._camera.transform.worldForward);
      this._forward.y = 0;
      this._forward.normalize();
      this._cross.set(this._forward.z, 0, -this._forward.x);

      const animationSpeed = 0.02;
      const animationState = this._animationState;
      const displacement = this._displacement;
      if (inputManager.isKeyHeldDown(Keys.KeyW)) {
        animationState.setMoveKey(Keys.KeyW);
        Vector3.scale(this._forward, animationSpeed, displacement);
      }
      if (inputManager.isKeyHeldDown(Keys.KeyS)) {
        animationState.setMoveKey(Keys.KeyS);
        Vector3.scale(this._forward, -animationSpeed, displacement);
      }
      if (inputManager.isKeyHeldDown(Keys.KeyA)) {
        animationState.setMoveKey(Keys.KeyA);
        Vector3.scale(this._cross, animationSpeed, displacement);
      }
      if (inputManager.isKeyHeldDown(Keys.KeyD)) {
        animationState.setMoveKey(Keys.KeyD);
        Vector3.scale(this._cross, -animationSpeed, displacement);
      }
      if (inputManager.isKeyDown(Keys.Space)) {
        animationState.setJumpKey();
        displacement.set(0, 0.05, 0);
      }
    } else {
      this._animationState.setMoveKey(null);
      this._displacement.set(0, 0, 0);
    }
    this._playAnimation();
  }

  onPhysicsUpdate() {
    const physicsManager = this.engine.physicsManager;
    const gravity = physicsManager.gravity;
    const fixedTimeStep = physicsManager.fixedTimeStep;
    this._fallAccumulateTime += fixedTimeStep;
    const character = this._controller;
    character.move(this._displacement, 0.0001, fixedTimeStep);
    const transform = this._character.transform;
    const yAxisMove = this._yAxisMove;

    yAxisMove.set(0, gravity.y * fixedTimeStep * this._fallAccumulateTime, 0);
    const flag = character.move(yAxisMove, 0.0001, fixedTimeStep);
    if (flag & ControllerCollisionFlag.Down) {
      this._fallAccumulateTime = 0;
      this._animationState.setIdleKey();
    } else {
      this._animationState.setFallKey();
    }
    this._playAnimation();

    if (this._displacement.x != 0 || this._displacement.z != 0) {
      this._predictPosition.copyFrom(transform.worldPosition);
      this._predictPosition.subtract(this._displacement);
      Matrix.lookAt(
        transform.worldPosition,
        this._predictPosition,
        this._up,
        this._rotMat
      );
      this._rotMat.getRotation(this._rotation).invert();
      const currentRot = transform.rotationQuaternion;
      Quaternion.slerp(currentRot, this._rotation, 0.1, this._newRotation);
      transform.rotationQuaternion = this._newRotation;
    }
  }

  private _playAnimation() {
    if (this._animationName !== this._animationState.state) {
      this._animator.crossFade(this._animationState.state, 0.1);
      this._animationName = this._animationState.state;
    }
  }
}

function addPlane(
  rootEntity: Entity,
  size: Vector2,
  position: Vector3,
  rotation: Quaternion
): Entity {
  const mtl = new PBRMaterial(rootEntity.engine);
  mtl.baseColor.set(
    0.2179807202597362,
    0.2939682161541871,
    0.31177952549087604,
    1
  );
  mtl.roughness = 0.0;
  mtl.metallic = 0.0;
  mtl.renderFace = RenderFace.Double;
  const planeEntity = rootEntity.createChild();

  const renderer = planeEntity.addComponent(MeshRenderer);
  renderer.mesh = PrimitiveMesh.createPlane(rootEntity.engine, size.x, size.y);
  renderer.setMaterial(mtl);
  planeEntity.transform.position = position;
  planeEntity.transform.rotationQuaternion = rotation;

  const physicsPlane = new PlaneColliderShape();
  physicsPlane.isTrigger = false;
  const planeCollider = planeEntity.addComponent(StaticCollider);
  planeCollider.addShape(physicsPlane);

  return planeEntity;
}

function addBox(
  rootEntity: Entity,
  size: Vector3,
  position: Vector3,
  rotation: Quaternion
): Entity {
  const mtl = new PBRMaterial(rootEntity.engine);
  mtl.roughness = 0.2;
  mtl.metallic = 0.8;
  mtl.baseColor.set(1, 1, 0, 1.0);
  const boxEntity = rootEntity.createChild();
  const renderer = boxEntity.addComponent(MeshRenderer);
  renderer.mesh = PrimitiveMesh.createCuboid(
    rootEntity.engine,
    size.x,
    size.y,
    size.z
  );
  renderer.setMaterial(mtl);
  boxEntity.transform.position = position;
  boxEntity.transform.rotationQuaternion = rotation;

  const physicsBox = new BoxColliderShape();
  physicsBox.size = size;
  physicsBox.isTrigger = false;
  const boxCollider = boxEntity.addComponent(StaticCollider);
  boxCollider.addShape(physicsBox);

  return boxEntity;
}

function addStair(
  rootEntity: Entity,
  size: Vector3,
  position: Vector3,
  rotation: Quaternion
): Entity {
  const mtl = new PBRMaterial(rootEntity.engine);
  mtl.roughness = 0.5;
  mtl.baseColor.set(0.9, 0.9, 0.9, 1.0);
  const mesh = PrimitiveMesh.createCuboid(
    rootEntity.engine,
    size.x,
    size.y,
    size.z
  );

  const stairEntity = rootEntity.createChild();
  stairEntity.transform.position = position;
  stairEntity.transform.rotationQuaternion = rotation;
  const boxCollider = stairEntity.addComponent(StaticCollider);
  {
    const level = stairEntity.createChild();
    const renderer = level.addComponent(MeshRenderer);
    renderer.mesh = mesh;
    renderer.setMaterial(mtl);
    const physicsBox = new BoxColliderShape();
    physicsBox.size = size;
    boxCollider.addShape(physicsBox);
  }

  {
    const level = stairEntity.createChild();
    level.transform.setPosition(0, 0.3, 0.5);
    const renderer = level.addComponent(MeshRenderer);
    renderer.mesh = mesh;
    renderer.setMaterial(mtl);
    const physicsBox = new BoxColliderShape();
    physicsBox.size = size;
    physicsBox.position.set(0, 0.3, 0.5);
    boxCollider.addShape(physicsBox);
  }

  {
    const level = stairEntity.createChild();
    level.transform.setPosition(0, 0.6, 1);
    const renderer = level.addComponent(MeshRenderer);
    renderer.mesh = mesh;
    renderer.setMaterial(mtl);
    const physicsBox = new BoxColliderShape();
    physicsBox.size = size;
    physicsBox.position.set(0, 0.6, 1);
    boxCollider.addShape(physicsBox);
  }

  {
    const level = stairEntity.createChild();
    level.transform.setPosition(0, 0.9, 1.5);
    const renderer = level.addComponent(MeshRenderer);
    renderer.mesh = mesh;
    renderer.setMaterial(mtl);
    const physicsBox = new BoxColliderShape();
    physicsBox.size = size;
    physicsBox.position.set(0, 0.9, 1.5);
    boxCollider.addShape(physicsBox);
  }
  return stairEntity;
}

function textureAndAnimationLoader(
  engine: Engine,
  materials: Material[],
  animator: Animator,
  animatorStateMachine: AnimatorStateMachine
) {
  engine.resourceManager
    .load<Texture2D>(
      "https://gw.alipayobjects.com/zos/OasisHub/440001585/6990/T_Doggy_1_diffuse.png"
    )
    .then((res) => {
      for (let i = 0, n = materials.length; i < n; i++) {
        const material = materials[i];
        (<PBRMaterial>material).baseTexture = res;
      }
    });
  engine.resourceManager
    .load<Texture2D>(
      "https://gw.alipayobjects.com/zos/OasisHub/440001585/3072/T_Doggy_normal.png"
    )
    .then((res) => {
      for (let i = 0, n = materials.length; i < n; i++) {
        const material = materials[i];
        (<PBRMaterial>material).normalTexture = res;
      }
    });
  engine.resourceManager
    .load<Texture2D>(
      "https://gw.alipayobjects.com/zos/OasisHub/440001585/5917/T_Doggy_roughness.png"
    )
    .then((res) => {
      for (let i = 0, n = materials.length; i < n; i++) {
        const material = materials[i];
        (<PBRMaterial>material).roughnessMetallicTexture = res;
      }
    });
  engine.resourceManager
    .load<Texture2D>(
      "https://gw.alipayobjects.com/zos/OasisHub/440001585/2547/T_Doggy_1_ao.png"
    )
    .then((res) => {
      for (let i = 0, n = materials.length; i < n; i++) {
        const material = materials[i];
        (<PBRMaterial>material).occlusionTexture = res;
      }
    });
  engine.resourceManager
    .load<GLTFResource>(
      "https://gw.alipayobjects.com/os/OasisHub/440001585/7205/Anim_Run.gltf"
    )
    .then((res) => {
      const animations = res.animations;
      if (animations) {
        animations.forEach((clip: AnimationClip) => {
          const animatorState = animatorStateMachine.addState(clip.name);
          animatorState.clip = clip;
        });
      }
    });
  engine.resourceManager
    .load<GLTFResource>(
      "https://gw.alipayobjects.com/os/OasisHub/440001585/3380/Anim_Idle.gltf"
    )
    .then((res) => {
      const animations = res.animations;
      if (animations) {
        animations.forEach((clip: AnimationClip) => {
          const animatorState = animatorStateMachine.addState(clip.name);
          animatorState.clip = clip;
        });
        animator.play(State.Idle);
        engine.run();
      }
    });
  engine.resourceManager
    .load<GLTFResource>(
      "https://gw.alipayobjects.com/os/OasisHub/440001585/5703/Anim_Landing.gltf"
    )
    .then((res) => {
      const animations = res.animations;
      if (animations) {
        animations.forEach((clip: AnimationClip) => {
          const animatorState = animatorStateMachine.addState(clip.name);
          animatorState.clip = clip;
        });
      }
    });
  engine.resourceManager
    .load<GLTFResource>(
      "https://gw.alipayobjects.com/os/OasisHub/440001585/3275/Anim_Fall.gltf"
    )
    .then((res) => {
      const animations = res.animations;
      if (animations) {
        animations.forEach((clip: AnimationClip) => {
          const animatorState = animatorStateMachine.addState(clip.name);
          animatorState.clip = clip;
        });
      }
    });
  engine.resourceManager
    .load<GLTFResource>(
      "https://gw.alipayobjects.com/os/OasisHub/440001585/2749/Anim_Jump_In.gltf"
    )
    .then((res) => {
      const animations = res.animations;
      if (animations) {
        animations.forEach((clip: AnimationClip) => {
          const animatorState = animatorStateMachine.addState(clip.name);
          animatorState.clip = clip;
        });
      }
    });
}

//----------------------------------------------------------------------------------------------------------------------
WebGLEngine.create({ canvas: "canvas", physics: new PhysXPhysics() }).then((engine) => {
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  scene.shadowDistance = 10;
  const { background } = scene;
  const rootEntity = scene.createRootEntity();

  // camera
  const cameraEntity = rootEntity.createChild("camera_node");
  cameraEntity.transform.position.set(4, 4, -4);
  cameraEntity.addComponent(Camera);
  cameraEntity.addComponent(OrbitControl);

  const lightNode = rootEntity.createChild("light_node");
  lightNode.transform.setPosition(8, 10, 10);
  lightNode.transform.lookAt(new Vector3(0, 0, 0));
  const directLight = lightNode.addComponent(DirectLight);
  directLight.shadowType = ShadowType.SoftLow;

  const entity = cameraEntity.createChild("text");
  entity.transform.position = new Vector3(0, 3.5, -10);
  const renderer = entity.addComponent(TextRenderer);
  renderer.color = new Color();
  renderer.text = "Use `WASD` to move character and `Space` to jump";
  renderer.font = Font.createFromOS(entity.engine, "Arial");
  renderer.fontSize = 40;

  // Create sky
  const sky = background.sky;
  const skyMaterial = new SkyBoxMaterial(engine);
  background.mode = BackgroundMode.Sky;
  sky.material = skyMaterial;
  sky.mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);

  addPlane(rootEntity, new Vector2(10, 6), new Vector3(), new Quaternion());
  const slope = new Quaternion();
  Quaternion.rotationEuler(45, 0, 0, slope);
  addBox(
    rootEntity,
    new Vector3(4, 4, 0.01),
    new Vector3(0, 0, 1),
    slope.normalize()
  );
  addStair(
    rootEntity,
    new Vector3(1, 0.3, 0.5),
    new Vector3(3, 0, 1),
    new Quaternion()
  );

  engine.resourceManager
    .load<AmbientLight>({
      type: AssetType.Env,
      url: "https://gw.alipayobjects.com/os/bmw-prod/09904c03-0d23-4834-aa73-64e11e2287b0.bin",
    })
    .then((ambientLight) => {
      scene.ambientLight = ambientLight;
      skyMaterial.texture = ambientLight.specularTexture;
      skyMaterial.textureDecodeRGBM = true;
    });

  engine.resourceManager
    .load<GLTFResource>(
      "https://gw.alipayobjects.com/os/OasisHub/440001585/5407/Doggy_Demo.gltf"
    )
    .then((asset) => {
      const { defaultSceneRoot } = asset;
      const controllerEntity = rootEntity.createChild("controller");
      controllerEntity.addChild(defaultSceneRoot);

      // animator
      defaultSceneRoot.transform.setPosition(0, -0.35, 0);
      const animator = defaultSceneRoot.getComponent(Animator);

      // controller
      const physicsCapsule = new CapsuleColliderShape();
      physicsCapsule.radius = 0.15;
      physicsCapsule.height = 0.2;
      const characterController =
        controllerEntity.addComponent(CharacterController);
      characterController.addShape(physicsCapsule);
      const userController = controllerEntity.addComponent(ControllerScript);
      userController.targetCamera(cameraEntity);
      userController.targetCharacter(defaultSceneRoot);

      textureAndAnimationLoader(
        engine,
        asset.materials,
        animator,
        animator.animatorController.layers[0].stateMachine
      );
    });
});
