/**
 * @title Flappy Bird
 * @category 2D
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*T7WET7OAjkAAAAAAAAAAAAAADiR2AQ/original
 */
import {
  AssetType,
  BoxColliderShape,
  Camera,
  Engine,
  Entity,
  Keys,
  MeshRenderer,
  PrimitiveMesh,
  Rect,
  Script,
  Sprite,
  SpriteRenderer,
  StaticCollider,
  Texture2D,
  UnlitMaterial,
  Vector2,
  Vector3,
  WebGLEngine,
} from "@galacean/engine";
import * as TWEEN from "@tweenjs/tween.js";
import { LitePhysics } from "@galacean/engine-physics-lite";

enum EnumBirdState {
  Alive = 0,
  Dead = 1,
}

enum EnumGameState {
  Idel = 0,
  Start = 1,
  End = 2,
}

/** The y coordinate of the ground collision detection. */
const groundY = -3.1;

const GameEvent = {
  fly: "fly",
  stateChange: "stateChange",
  showGui: "showGui",
  checkHitGui: "checkHitGui",
  checkHit: "checkHit",
  gameOver: "gameOver",
  addScore: "addScore",
  reStartGame: "reStartGame",
};

let gameResArray: Texture2D[];
// We can customize the size of the interface that is finally presented to the player.
const designWidth = 768;
const designHeight = 896;
const aspectRatio = designWidth / designHeight;
const canvas = <HTMLCanvasElement>document.getElementById("canvas");
const parentEle = <HTMLElement>canvas.parentElement;
let { clientWidth, clientHeight } = parentEle;
if (clientWidth / clientHeight > aspectRatio) {
  clientWidth = clientHeight * aspectRatio;
  canvas.style.width = clientWidth + "px";
  canvas.style.marginLeft = (parentEle.clientWidth - clientWidth) / 2 + "px";
} else {
  clientHeight = clientWidth / aspectRatio;
  canvas.style.height = clientHeight + "px";
  canvas.style.marginTop = (parentEle.clientHeight - clientHeight) / 2 + "px";
}
// Create engine object.
WebGLEngine.create({ canvas: "canvas", physics: new LitePhysics() }).then(
  (engine) => {
    engine.canvas.resizeByClientSize(designHeight / clientHeight);

    const scene = engine.sceneManager.activeScene;
    const rootEntity = scene.createRootEntity();

    // Create camera.
    const cameraEntity = rootEntity.createChild("camera");
    cameraEntity.transform.setPosition(0.3, 0, 5);
    const camera = cameraEntity.addComponent(Camera);
    // 2D is more suitable for orthographic cameras.
    camera.isOrthographic = true;
    // @ts-ignore
    camera.orthographicSize = engine.canvas.height / Engine._pixelsPerUnit / 2;

    // Load the resources needed by the game.
    engine.resourceManager
      // @ts-ignore
      .load<Texture2D[]>([
        {
          // Background.
          url: "https://gw.alipayobjects.com/zos/OasisHub/315000157/5244/background.png",
          type: AssetType.Texture2D,
        },
        {
          // Pipe.
          url: "https://gw.alipayobjects.com/zos/OasisHub/315000157/5987/pipe.png",
          type: AssetType.Texture2D,
        },
        {
          // Ground.
          url: "https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*Sj7OS4YJHDIAAAAAAAAAAAAAARQnAQ",
          type: AssetType.Texture2D,
        },
        {
          // Bird.
          url: "https://gw.alipayobjects.com/zos/OasisHub/315000157/8356/bird.png",
          type: AssetType.Texture2D,
        },
        {
          // Restart.
          url: "https://gw.alipayobjects.com/zos/OasisHub/315000157/6695/restart.png",
          type: AssetType.Texture2D,
        },
        {
          // Number.
          url: "https://gw.alipayobjects.com/zos/OasisHub/315000157/8709/527-number.png",
          type: AssetType.Texture2D,
        },
      ])
      .then((texture2DArr: Texture2D[]) => {
        // Record the resources.
        gameResArray = texture2DArr;
        // Initialize location information and component information.
        // Background.
        const nodeBg = rootEntity.createChild("nodeBg");
        nodeBg.transform.setPosition(0.3, 0, -10);
        nodeBg.addComponent(SpriteRenderer).sprite = new Sprite(
          engine,
          texture2DArr[0]
        );

        // Pipe.
        const nodePipe = rootEntity.createChild("nodePipe");
        nodePipe.transform.setPosition(0, 0, -3);
        nodePipe.addComponent(ScriptPipe);

        // Ground.
        const nodeGround = rootEntity.createChild("nodeGround");
        nodeGround.transform.setPosition(0.3, -4.125, -2);
        nodeGround.transform.setRotation(90, 0, 0);
        const groundRenderer = nodeGround.addComponent(MeshRenderer);
        groundRenderer.mesh = PrimitiveMesh.createPlane(engine, 7.68, 1.28);
        const groundMaterial = new UnlitMaterial(engine);
        groundRenderer.setMaterial(groundMaterial);
        groundMaterial.baseTexture = texture2DArr[2];
        groundMaterial.tilingOffset.set(21, 1, 0, 0);
        nodeGround.addComponent(ScriptGround);

        // Bird.
        const nodeBird = rootEntity.createChild("nodeBird");
        nodeBird.transform.setPosition(-1, 1.15, 0);
        nodeBird.addComponent(SpriteRenderer).sprite = new Sprite(
          engine,
          texture2DArr[3]
        );
        nodeBird.addComponent(ScriptBird);

        // Death Effect.
        const nodeDeathEff = rootEntity.createChild("nodeEff");
        nodeDeathEff.transform.setPosition(0, 0, -1);
        nodeDeathEff.transform.setRotation(90, 0, 0);
        const effRenderer = nodeDeathEff.addComponent(MeshRenderer);
        effRenderer.mesh = PrimitiveMesh.createPlane(engine, 20, 20);
        const material = new UnlitMaterial(engine);
        effRenderer.setMaterial(material);
        // Can be transparent.
        material.isTransparent = true;
        material.baseColor.set(0, 0, 0, 0);
        nodeDeathEff.addComponent(ScriptDeathEff);

        // GUI.
        const nodeGui = rootEntity.createChild("nodeGui");
        nodeGui.transform.setPosition(0.3, 0, 1);
        // Restart.
        const nodeRestart = nodeGui.createChild("nodeRestart");
        nodeRestart.addComponent(SpriteRenderer).sprite = new Sprite(
          engine,
          texture2DArr[4]
        );
        // Score.
        const nodeScore = nodeGui.createChild("nodeScore");
        nodeScore.transform.setPosition(0, 3.2, 0);
        nodeScore.transform.setScale(0.3, 0.3, 0.3);
        nodeScore.addComponent(ScriptScore);
        nodeGui.addComponent(ScriptGUI);

        // GameCtrl controls the global game.
        rootEntity.addComponent(GameCtrl);
      });

    engine.run();

    class ScriptPipe extends Script {
      /** When there is no pipe in the pool, use this instance to clone. */
      private _originPipe: Entity;
      /** All current pipes. */
      private _nowPipeArr: Array<Entity> = [];
      /** Pool for reuse. */
      private _pipePool: Array<Entity> = [];
      /** Timestamp of the start of the game. */
      private _curStartTimeStamp: number;
      /**  Hide when the x coordinate of the pipe is less than -4.6. */
      private _pipeHideX: number = 4.6;
      /**  Vertical distance of pipe. */
      private _pipeVerticalDis: number = 10.8;
      /**  Horizontal distance of pipe. */
      private _pipeHorizontalDis: number = 4;
      /**  Random location range generated by pipes. */
      private _pipeRandomPosY: number = 3.5;
      /**  Water pipe debut time(s). */
      private _pipeDebutTime: number = 3;
      /**  Horizontal movement speed. */
      private _pipeHorizontalV: number = 3;

      onAwake() {
        // Init originPipe.
        const pipe = (this._originPipe = new Entity(engine));
        const node1 = pipe.createChild("node1");
        const node2 = pipe.createChild("node2");
        const verticalDis = this._pipeVerticalDis;
        node1.transform.setPosition(0, -verticalDis / 2, 0);
        node2.transform.setPosition(0, verticalDis / 2, 0);
        node2.transform.setScale(1, -1, 1);
        node1.addComponent(SpriteRenderer).sprite = new Sprite(
          engine,
          gameResArray[1]
        );
        node2.addComponent(SpriteRenderer).sprite = new Sprite(
          engine,
          gameResArray[1]
        );
        this._pipePool.push(pipe);

        // Control the performance of the pipe according to the change of the game state.
        engine.on(GameEvent.stateChange, (gameState: EnumGameState) => {
          switch (gameState) {
            case EnumGameState.Idel:
              this.enabled = false;
              this._destroyPipe();
              break;
            case EnumGameState.Start:
              this.enabled = true;
              this._curStartTimeStamp = engine.time.actualElapsedTime;
              break;
            case EnumGameState.End:
              this.enabled = false;
              break;
          }
        });

        // When checkHit is monitored, check the collision between the pipe and the bird.
        engine.on(GameEvent.checkHit, (birdY: number) => {
          var len = this._nowPipeArr.length;
          for (var i = 0; i < len; i++) {
            var pipePos = this._nowPipeArr[i].transform.position;
            if (Math.abs(pipePos.x) < 0.9) {
              if (Math.abs(pipePos.y - birdY) > 1.2) {
                engine.dispatch(GameEvent.gameOver);
              }
              break;
            }
          }
        });
      }

      /**
       * Three things will be done here every frame：
       *    1.Adjust the generation of the pipe.
       *    2.Adjust the position of the pipe.
       *    3.Judge whether to get a point.
       * @param deltaTime - The deltaTime when the script update
       */
      onUpdate(deltaTime: number) {
        const debutTime = this._pipeDebutTime;
        // The water pipe will be displayed after the start of the game pipeDebutTime.
        if (
          engine.time.actualElapsedTime - this._curStartTimeStamp >=
          debutTime
        ) {
          let bAddScore = false;
          // After deltaTime, the distance the pipe has moved.
          const changeVal = deltaTime * this._pipeHorizontalV;
          const pipeLen = this._nowPipeArr.length;
          const {
            _pipeHorizontalDis: horizontalDis,
            _pipeRandomPosY: randomPosY,
            _pipeHideX: hideX,
          } = this;
          // Adjust the position of all pipes.
          if (pipeLen > 0) {
            for (let i = pipeLen - 1; i >= 0; i--) {
              const pipe = this._nowPipeArr[i];
              const pipeTrans = pipe.transform;
              const pipePos = pipeTrans.position;
              if (pipePos.x < -hideX) {
                // The invisible pipe can be destroyed.
                this._destroyPipe(i);
              } else {
                if (
                  !bAddScore &&
                  pipePos.x > -1 &&
                  pipePos.x - changeVal <= -1
                ) {
                  // Get a point.
                  engine.dispatch(GameEvent.addScore);
                  bAddScore = true;
                }
                pipeTrans.setPosition(
                  pipePos.x - changeVal,
                  pipePos.y,
                  pipePos.z
                );
              }
              // Judge whether the pipe needs to be regenerated according to the X coordinate.
              if (i == pipeLen - 1 && pipePos.x <= hideX - horizontalDis) {
                this._createPipe(
                  hideX,
                  randomPosY * Math.random() - randomPosY / 2 + 0.8,
                  0
                );
              }
            }
          } else {
            // Need to regenerate a pipe.
            this._createPipe(
              hideX,
              randomPosY * Math.random() - randomPosY / 2 + 0.8,
              0
            );
          }
        }
      }

      private _createPipe(posX: number, posY: number, posZ: number) {
        const pipePool = this._pipePool;
        const pipe =
          pipePool.length > 0
            ? <Entity>pipePool.pop()
            : this._originPipe.clone();
        pipe.transform.setPosition(posX, posY, posZ);
        this.entity.addChild(pipe);
        this._nowPipeArr.push(pipe);
      }

      /**
       * It’s not really destroyed, we just put it in the pool.
       * @param pipeIndex - If pipeIndex is less than 0, we recycle all pipes
       */
      private _destroyPipe(pipeIndex: number = -1) {
        const { entity, _pipePool, _nowPipeArr } = this;
        const removePipe = (pipe: Entity) => {
          entity.removeChild(pipe);
          _pipePool.push(pipe);
        };
        if (pipeIndex >= 0) {
          removePipe(_nowPipeArr[pipeIndex]);
          _nowPipeArr.splice(pipeIndex, 1);
        } else {
          for (let index = _nowPipeArr.length - 1; index >= 0; index--) {
            removePipe(_nowPipeArr[index]);
          }
          _nowPipeArr.length = 0;
        }
      }
    }

    class ScriptScore extends Script {
      /** The sprite array used by the score（0～9）. */
      private _spriteArray: Sprite[] = [];
      /** Interval between each number. */
      private _numInv = 2;
      /** Each number in the score. */
      private _scoreEntitys: Entity[] = [];
      private _scoreRenderer: SpriteRenderer[] = [];
      private _myScore = 0;

      onAwake() {
        // Init spriteArray.
        const spriteArray = this._spriteArray;
        // Cut digital resources into ten.
        for (var i = 0; i < 10; i++) {
          spriteArray.push(
            new Sprite(engine, gameResArray[5], new Rect(i * 0.1, 0, 0.1, 1))
          );
        }

        engine.on(GameEvent.addScore, () => {
          ++this._myScore;
          this._showScore("" + this._myScore);
        });

        // Control the performance of the score according to the change of the game state.
        engine.on(GameEvent.stateChange, (gameState: EnumGameState) => {
          switch (gameState) {
            case EnumGameState.Idel:
              this.entity.isActive = false;
              break;
            case EnumGameState.Start:
              this.entity.isActive = true;
              this._myScore = 0;
              this._showScore("0");
              break;
            case EnumGameState.End:
              break;
          }
        });
      }

      private _showScore(scoreNumStr: string) {
        const scoreLen = scoreNumStr.length;
        const {
          entity,
          _numInv: inv,
          _scoreEntitys: scoreEntitys,
          _spriteArray: spriteArray,
          _scoreRenderer: scoreRenderers,
        } = this;
        var nowEntityLen = scoreEntitys.length;
        let scoreEntity: Entity;
        let scoreRenderer: SpriteRenderer;
        // If the entity is not enough, new one.
        if (scoreLen > nowEntityLen) {
          for (let i = nowEntityLen; i < scoreLen; i++) {
            scoreEntity = new Entity(engine);
            scoreRenderer = scoreEntity.addComponent(SpriteRenderer);
            scoreRenderers.push(scoreRenderer);
            scoreEntitys.push(scoreEntity);
            entity.addChild(scoreEntity);
          }
        }

        // At the moment nowEntityLen >= scoreLen.
        nowEntityLen = scoreEntitys.length;
        const startX = ((1 - scoreLen) * inv) / 2;
        for (let i = 0; i < nowEntityLen; i++) {
          scoreEntity = scoreEntitys[i];
          if (i >= scoreLen) {
            scoreEntity.isActive = false;
          } else {
            scoreEntity.isActive = true;
            scoreEntity.transform.setPosition(startX + i * inv, 0, 0);
            scoreRenderers[i].sprite = spriteArray[parseInt(scoreNumStr[i])];
          }
        }
      }
    }

    class ScriptGround extends Script {
      /** Swap two pieces of ground to achieve constant movement. */
      private _groundMaterial: UnlitMaterial;
      /** Horizontal movement speed. */
      private _groundHorizontalV: number = 8.2;

      onAwake() {
        this._groundMaterial = <UnlitMaterial>(
          this.entity.getComponent(MeshRenderer).getMaterial()
        );
        // Control the performance of the ground according to the change of the game state.
        engine.on(GameEvent.stateChange, (gameState: EnumGameState) => {
          switch (gameState) {
            case EnumGameState.Idel:
            case EnumGameState.Start:
              this.enabled = true;
              break;
            case EnumGameState.End:
              this.enabled = false;
              break;
            default:
              break;
          }
        });

        // When checkHit is monitored, check the collision between the ground and the bird.
        engine.on(GameEvent.checkHit, (birdY) => {
          birdY < groundY && engine.dispatch(GameEvent.gameOver);
        });
      }

      onUpdate(deltaTime: number) {
        // After deltaTime, the distance the ground has moved.
        this._groundMaterial.tilingOffset.z +=
          deltaTime * this._groundHorizontalV;
      }
    }

    class GameCtrl extends Script {
      private _gameState: EnumGameState;

      onAwake() {
        engine.on(GameEvent.reStartGame, () => {
          this._setGameState(EnumGameState.Idel);
        });

        engine.on(GameEvent.gameOver, () => {
          this._setGameState(EnumGameState.End);
        });

        const boxCollider: StaticCollider =
          this.entity.addComponent(StaticCollider);
        const boxColliderShape = new BoxColliderShape();
        boxColliderShape.size.set(10, 10, 0.001);
        boxCollider.addShape(boxColliderShape);
      }

      onStart() {
        // Give a state at the beginning.
        this._setGameState(EnumGameState.Idel);
      }

      onUpdate() {
        // Update TWEEN.
        TWEEN.update();
        if (engine.inputManager.isKeyDown(Keys.Space)) {
          this._dispatchFly();
        }
      }

      onPointerDown() {
        this._dispatchFly();
      }

      private _dispatchFly() {
        switch (this._gameState) {
          case EnumGameState.Idel:
            this._setGameState(EnumGameState.Start);
            engine.dispatch(GameEvent.fly);
            break;
          case EnumGameState.Start:
            engine.dispatch(GameEvent.fly);
            break;
          default:
            break;
        }
      }

      /**
       * The status will be distributed to all objects in the game.
       * @param state - EnumGameState
       */
      private _setGameState(state: EnumGameState) {
        if (this._gameState != state) {
          this._gameState = state;
          engine.dispatch(GameEvent.stateChange, state);
        }
      }
    }

    class ScriptGUI extends Script {
      onAwake() {
        const { entity } = this;
        const resetBtnNode = entity.findByName("nodeRestart");

        // Add BoxCollider.
        const boxCollider: StaticCollider =
          resetBtnNode.addComponent(StaticCollider);
        const boxColliderShape = new BoxColliderShape();
        boxColliderShape.size.set(2.14, 0.75, 0.001);
        boxCollider.addShape(boxColliderShape);
        resetBtnNode.addComponent(Script).onPointerClick = () => {
          engine.dispatch(GameEvent.reStartGame);
        };

        // Control the performance of the GUI according to the change of the game state.
        engine.on(GameEvent.stateChange, (gameState: EnumGameState) => {
          switch (gameState) {
            case EnumGameState.Idel:
            case EnumGameState.Start:
              resetBtnNode.isActive = false;
              break;
            case EnumGameState.End:
              break;
            default:
              break;
          }
        });

        engine.on(GameEvent.showGui, () => {
          resetBtnNode.isActive = true;
        });
      }
    }

    class ScriptBird extends Script {
      /** Offsets of sprite sheet animation. */
      private _regions: Vector2[] = [
        new Vector2(0, 0),
        new Vector2(1 / 3, 0),
        new Vector2(2 / 3, 0),
      ];
      /** Reciprocal Of SliceWidth. */
      private _reciprocalSliceWidth: number = 1 / 3;
      /** Reciprocal Of SliceHeight. */
      private _reciprocalSliceHeight: number = 1;
      /** Frame interval time, the unit of time is s. */
      private _frameInterval = 0.15;
      /** Total frames. */
      private _totalFrames = 3;
      /** Maximum downward speed */
      private _maxDropV = -8;
      /** Acceleration of gravity */
      private _gravity = -35;
      /** Initial upward speed given during fly */
      private _startFlyV = 10;

      private _cumulativeTime: number = 0;
      private _birdState = EnumBirdState.Alive;

      private _sprite: Sprite;
      private _curFrameIndex: number;
      private _startY: number;
      private _flyStartTime: number;
      private _gameState: EnumGameState;
      private _yoyoTween;
      private _dropTween;

      onAwake() {
        this._initDataAndUI();
        this._initTween();
        this._initListener();
      }

      onUpdate(deltaTime: number) {
        // Update the performance of the bird.
        switch (this._birdState) {
          case EnumBirdState.Alive:
            const { _frameInterval, _totalFrames } = this;
            this._cumulativeTime += deltaTime;
            if (this._cumulativeTime >= _frameInterval) {
              // Need update frameIndex.
              const addFrameCount = Math.floor(
                this._cumulativeTime / _frameInterval
              );
              this._cumulativeTime -= addFrameCount * _frameInterval;
              this._setFrameIndex(
                (this._curFrameIndex + addFrameCount) % _totalFrames
              );
            }

            // Update bird's location information.
            if (this._gameState == EnumGameState.Start) {
              // Free fall and uniform motion are superimposed to obtain the current position.
              let endY;
              const { _maxDropV, _startFlyV, _gravity } = this;
              const transform = this.entity.transform;
              const position = transform.position;
              // How much time has passed.
              const subTime =
                engine.time.actualElapsedTime - this._flyStartTime;
              // How long has it been in free fall.
              const addToMaxUseTime = (_maxDropV - _startFlyV) / _gravity;
              if (subTime <= addToMaxUseTime) {
                // Free fall.
                endY =
                  ((_startFlyV + (_startFlyV + subTime * _gravity)) * subTime) /
                    2 +
                  this._startY;
              } else {
                // Falling at a constant speed.
                endY =
                  ((_maxDropV + _startFlyV) * addToMaxUseTime) / 2 +
                  _maxDropV * (subTime - addToMaxUseTime) +
                  this._startY;
              }
              transform.setPosition(position.x, endY, position.z);
            }
            break;
          case EnumBirdState.Dead:
            this._setFrameIndex(0);
            break;
        }
      }

      onLateUpdate() {
        // After updating the position, check the collision.
        engine.dispatch(GameEvent.checkHit, this.entity.transform.position.y);
      }

      private _initDataAndUI() {
        const { entity } = this;
        const renderer = entity.getComponent(SpriteRenderer);
        renderer.sprite = this._sprite = new Sprite(engine, gameResArray[3]);
        this._setFrameIndex(0);
      }

      private _initTween() {
        const transform = this.entity.transform;
        const rotation = transform.rotation;
        const position = transform.position;
        this._yoyoTween = new TWEEN.Tween(position)
          .to({ y: 0.25 }, 380)
          .repeat(Infinity)
          .onUpdate((target) => {
            transform.position = target;
          })
          .yoyo(true)
          .easing(TWEEN.Easing.Sinusoidal.InOut);
        this._dropTween = new TWEEN.Tween(rotation)
          .to({ z: -90 }, 380)
          .onUpdate((target) => {
            transform.rotation = target;
          })
          .delay(520);
      }

      private _initListener() {
        const transform = this.entity.transform;
        engine.on(GameEvent.fly, () => {
          // Record start time and location.
          this._startY = transform.position.y;
          this._flyStartTime = engine.time.actualElapsedTime;
          // Flying performance.
          this._yoyoTween.stop();
          this._dropTween.stop();
          transform.setRotation(transform.rotation.x, transform.rotation.y, 20);
          this._dropTween.start();
        });

        // Control the performance of the bird according to the change of the game state.
        engine.on(GameEvent.stateChange, (gameState: EnumGameState) => {
          this._gameState = gameState;
          switch (gameState) {
            case EnumGameState.Idel:
              transform.setPosition(0, 0, 0);
              transform.rotation = new Vector3(0, 0, 0);
              this._birdState = EnumBirdState.Alive;
              this._yoyoTween.start();
              break;
            case EnumGameState.Start:
              break;
            case EnumGameState.End:
              this._birdState = EnumBirdState.Dead;
              setTimeout(() => {
                const { position, rotation } = transform;
                const birdPosY = position.y;
                if (birdPosY > groundY) {
                  this._yoyoTween.stop();
                  this._dropTween.stop();
                  new TWEEN.Tween(rotation)
                    .duration((birdPosY - groundY) * 40)
                    .to({ z: -90 })
                    .onUpdate((target) => {
                      transform.rotation = target;
                    })
                    .start();
                  new TWEEN.Tween(position)
                    .duration((birdPosY - groundY) * 120)
                    .to({ y: groundY })
                    .onUpdate((target) => {
                      transform.position = target;
                    })
                    .onComplete(() => {
                      engine.dispatch(GameEvent.showGui);
                    })
                    .start();
                } else {
                  engine.dispatch(GameEvent.showGui);
                }
              }, 300);
              break;
          }
        });
      }

      private _setFrameIndex(frameIndex: number) {
        if (this._curFrameIndex !== frameIndex) {
          this._curFrameIndex = frameIndex;
          const frameInfo = this._regions[frameIndex];
          const region = this._sprite.region;
          region.set(
            frameInfo.x,
            frameInfo.y,
            this._reciprocalSliceWidth,
            this._reciprocalSliceHeight
          );
          this._sprite.region = region;
        }
      }
    }

    class ScriptDeathEff extends Script {
      onAwake() {
        const entity = this.entity;
        const renderer = entity.getComponent(MeshRenderer);
        const material = <UnlitMaterial>renderer.getMaterial();

        // init Tween.
        const baseColor = material.baseColor;
        const shockTween = new TWEEN.Tween(baseColor)
          .to({ a: 1 }, 80)
          .repeat(1)
          .yoyo(true)
          .delay(20);
        engine.on(GameEvent.stateChange, (gameState: EnumGameState) => {
          switch (gameState) {
            case EnumGameState.End:
              shockTween.start();
              break;
          }
        });
      }
    }
  }
);
