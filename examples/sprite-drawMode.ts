/**
 * @title Sprite Draw Mode
 * @category 2D
 * @thumbnail https://mdn.alipayobjects.com/merchant_appfe/afts/img/A*KllLQLmE3kAAAAAAAAAAAAAADiR2AQ/original
 */
import {
  AssetType,
  Camera,
  Color,
  Entity,
  Logger,
  MathUtil,
  MeshRenderer,
  MeshTopology,
  ModelMesh,
  Script,
  Sprite,
  SpriteDrawMode,
  SpriteRenderer,
  SpriteTileMode,
  SubMesh,
  Texture2D,
  UnlitMaterial,
  Vector3,
  Vector4,
  WebGLEngine
} from "@galacean/engine";
import * as dat from "dat.gui";

Logger.enable();

WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  // Create engine object.
  engine.canvas.resizeByClientSize();

  // Create root entity.
  const rootEntity = engine.sceneManager.activeScene.createRootEntity();

  // Create camera.
  const cameraEntity = rootEntity.createChild("Camera");
  cameraEntity.transform.setPosition(0, 0, 5);
  const camera = cameraEntity.addComponent(Camera);
  camera.isOrthographic = true;
  camera.orthographicSize = 5;

  let spriteSlice: Sprite;
  let spriteTile: Sprite;
  engine.resourceManager
    // @ts-ignore
    .load<Texture2D[]>([
      {
        url: "https://gw.alipayobjects.com/mdn/rms_7c464e/afts/img/A*0vm_SJVssKAAAAAAAAAAAAAAARQnAQ",
        type: AssetType.Texture2D
      },
      {
        url: "https://mdn.alipayobjects.com/huamei_jvf0dp/afts/img/A*5whjSZVzm_kAAAAAAAAAAAAADleLAQ/original",
        type: AssetType.Texture2D
      }
    ])
    .then((textureArr) => {
      spriteSlice = new Sprite(engine, textureArr[0]);
      spriteTile = new Sprite(engine, textureArr[1]);
      // Create origin sprite entity.
      const spriteEntity = rootEntity.createChild("spriteSlice");
      const spriteRenderer = spriteEntity.addComponent(SpriteRenderer);
      const sprite = (spriteRenderer.sprite = spriteSlice);
      spriteRenderer.drawMode = SpriteDrawMode.Sliced;
      sprite.border = new Vector4();
      addDataGUI(spriteEntity);
    });

  engine.run();

  /**
   * Auxiliary display.
   */
  class TriangleScript extends Script {
    private triangleEntity: Entity;
    private modelMesh: ModelMesh;
    private targetSpriteRenderer: SpriteRenderer;

    onAwake(): void {
      const { engine, entity } = this;
      const triangleEntity = (this.triangleEntity = entity.createChild("tag"));
      const meshRenderer = triangleEntity.addComponent(MeshRenderer);
      meshRenderer.mesh = this.modelMesh = new ModelMesh(engine, "tag");
      // @ts-ignore
      this.modelMesh._primitive.enableVAO = false;
      const material = new UnlitMaterial(engine);
      material.baseColor = new Color(1, 0, 0, 1);
      meshRenderer.setMaterial(material);
      this.targetSpriteRenderer = entity.getComponent(SpriteRenderer);
    }

    setShow(value: boolean) {
      this.enabled = this.triangleEntity.isActive = value;
    }

    onUpdate(): void {
      const { modelMesh, targetSpriteRenderer } = this;
      const subChunk = targetSpriteRenderer._subChunk;
      if (subChunk) {
        const vertexArea = subChunk.vertexArea;
        const vertexCount = vertexArea.size / 9;
        const vertices = subChunk.chunk.vertices;
        const myPositions = modelMesh.getPositions() || [];
        for (let i = 0, o = vertexArea.start; i < vertexCount; ++i, o += 9) {
          if (myPositions[i]) {
            myPositions[i].copyFromArray(vertices, o);
          } else {
            myPositions[i] = new Vector3(vertices[o], vertices[o + 1], vertices[o + 2]);
          }
        }

        const trianglesCount =
          targetSpriteRenderer.drawMode === SpriteDrawMode.Sliced ? (vertexCount * 27) / 4 : vertexCount * 3;
        const myTriangles = modelMesh.getIndices() || new Uint16Array(Math.floor(4096 * 3));
        const indices = subChunk.indices;
        for (let i = 0, l = trianglesCount / 6; i < l; i++) {
          const i3 = i * 3;
          const i31 = i3 + 1;
          const i32 = i3 + 2;
          const i6 = i * 6;
          myTriangles[i6] = indices[i3];
          myTriangles[i6 + 1] = indices[i31];
          myTriangles[i6 + 2] = indices[i31];
          myTriangles[i6 + 3] = indices[i32];
          myTriangles[i6 + 4] = indices[i32];
          myTriangles[i6 + 5] = indices[i3];
        }

        modelMesh.setPositions(myPositions);
        modelMesh.setIndices(myTriangles);
        const subMesh = modelMesh.subMesh;
        if (subMesh) {
          subMesh.count = trianglesCount;
        } else {
          modelMesh.addSubMesh(new SubMesh(0, trianglesCount, MeshTopology.Lines));
        }
        modelMesh.uploadData(false);
      }
    }
  }

  /**
   * Add data GUI.
   */
  function addDataGUI(entity: Entity) {
    const spriteRenderer = entity.getComponent(SpriteRenderer);
    const triangleScript = entity.addComponent(TriangleScript);
    triangleScript.setShow(false);
    const sprite = spriteRenderer.sprite;
    const border = sprite.border;
    const gui = new dat.GUI();
    const defaultWidth = spriteRenderer.width;
    const defaultHeight = spriteRenderer.height;
    const guiData = {
      drawMode: "Slice",
      left: 0,
      bottom: 0,
      right: 0,
      top: 0,
      showTriangle: false,
      width: defaultWidth,
      height: defaultHeight,
      tiledMode: "Continuous",
      threshold: 0.5,
      reset: () => {
        spriteRenderer.width = guiData.width = defaultWidth;
        spriteRenderer.height = guiData.height = defaultHeight;
        spriteRenderer.tileMode = SpriteTileMode.Continuous;
        spriteRenderer.tiledAdaptiveThreshold = 0.5;
        sprite.border = border.set(0, 0, 0, 0);
        guiData.tiledMode = "Continuous";
        guiData.threshold = 0.5;
        guiData.left = guiData.bottom = guiData.right = guiData.top = 0;
        guiData.showTriangle = false;
        if (spriteRenderer.drawMode === SpriteDrawMode.Tiled) {
          show(tileModeGui);
          hide(tiledAdaptiveThresholdGui);
        } else {
          hide(tileModeGui);
          hide(tiledAdaptiveThresholdGui);
        }
      }
    };

    function hide(gui) {
      gui.__li.style.display = "none";
    }
    function show(gui) {
      gui.__li.style.display = "block";
    }

    const rendererFolder = gui.addFolder("SpriteRenderer");
    rendererFolder.open();
    rendererFolder
      .add(guiData, "drawMode", ["Simple", "Slice", "Tiled"])
      .onChange((value: string) => {
        switch (value) {
          case "Simple":
            spriteRenderer.drawMode = SpriteDrawMode.Simple;
            hide(tileModeGui);
            hide(tiledAdaptiveThresholdGui);
            spriteRenderer.sprite = spriteSlice;
            break;
          case "Slice":
            spriteRenderer.drawMode = SpriteDrawMode.Sliced;
            hide(tileModeGui);
            hide(tiledAdaptiveThresholdGui);
            spriteRenderer.sprite = spriteSlice;
            break;
          case "Tiled":
            spriteRenderer.drawMode = SpriteDrawMode.Tiled;
            spriteRenderer.sprite = spriteTile;
            show(tileModeGui);
            if (guiData.tiledMode === "Adaptive") {
              show(tiledAdaptiveThresholdGui);
            } else {
              hide(tiledAdaptiveThresholdGui);
            }
            break;
          default:
            break;
        }
      })
      .listen();

    const tileModeGui = rendererFolder
      .add(guiData, "tiledMode", ["Adaptive", "Continuous"])
      .onChange((value: string) => {
        switch (value) {
          case "Adaptive":
            spriteRenderer.tileMode = SpriteTileMode.Adaptive;
            show(tiledAdaptiveThresholdGui);
            break;
          case "Continuous":
            spriteRenderer.tileMode = SpriteTileMode.Continuous;
            hide(tiledAdaptiveThresholdGui);
            break;
          default:
            break;
        }
      })
      .listen();

    const tiledAdaptiveThresholdGui = rendererFolder
      .add(guiData, "threshold", 0.0, 1.0, 0.01)
      .onChange((value: number) => {
        spriteRenderer.tiledAdaptiveThreshold = value;
      });

    rendererFolder
      .add(guiData, "width", defaultWidth / 5, defaultWidth * 20, defaultWidth / 10)
      .onChange((value: number) => {
        spriteRenderer.width = value;
      })
      .listen();
    rendererFolder
      .add(guiData, "height", defaultHeight / 5, defaultHeight * 20, defaultHeight / 10)
      .onChange((value: number) => {
        spriteRenderer.height = value;
      })
      .listen();

    const spriteFolder = gui.addFolder("Sprite Border");
    spriteFolder.open();
    spriteFolder
      .add(guiData, "left", 0.0, 1.0, 0.01)
      .onChange((value: number) => {
        guiData.left = border.x = MathUtil.clamp(value, 0, 1 - border.z);
        sprite.border = border;
      })
      .listen();
    spriteFolder
      .add(guiData, "bottom", 0.0, 1.0, 0.01)
      .onChange((value: number) => {
        guiData.bottom = border.y = MathUtil.clamp(value, 0, 1 - border.w);
        sprite.border = border;
      })
      .listen();
    spriteFolder
      .add(guiData, "right", 0.0, 1.0, 0.01)
      .onChange((value: number) => {
        guiData.right = border.z = MathUtil.clamp(value, 0, 1 - border.x);
        sprite.border = border;
      })
      .listen();
    spriteFolder
      .add(guiData, "top", 0.0, 1.0, 0.01)
      .onChange((value: number) => {
        guiData.top = border.w = MathUtil.clamp(value, 0, 1 - border.y);
        sprite.border = border;
      })
      .listen();
    gui
      .add(guiData, "showTriangle")
      .onChange((value: boolean) => {
        triangleScript.setShow(value);
      })
      .listen();

    gui.add(guiData, "reset");
    hide(tileModeGui);
    hide(tiledAdaptiveThresholdGui);
    return guiData;
  }
});
