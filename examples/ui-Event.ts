/**
 * @title UI Event
 * @category UI
 */
import { AssetType, PointerEventData, Script, Sprite, Texture2D, WebGLEngine } from "@galacean/engine";
import { CanvasRenderMode, Image, UICanvas, UITransform } from "@galacean/engine-ui";

// Create engine
WebGLEngine.create({ canvas: "canvas" }).then((engine) => {
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  const rootEntity = scene.createRootEntity();

  // Add canvas
  const canvasEntity = rootEntity.createChild("canvas");
  const canvas = canvasEntity.addComponent(UICanvas);
  canvas.renderMode = CanvasRenderMode.ScreenSpaceOverlay;
  canvas.referenceResolutionPerUnit = 50;

  // Add ImageOne
  const imageEntity1 = canvasEntity.createChild("Image1");
  const image1 = imageEntity1.addComponent(Image);
  image1.color.set(1, 0, 0, 1);
  (<UITransform>imageEntity1.transform).size.set(300, 300);
  imageEntity1.addComponent(EventScript);

  const imageEntity2 = imageEntity1.createChild("Image2");
  const image2 = imageEntity2.addComponent(Image);
  image2.color.set(0, 1, 0, 1);
  (<UITransform>imageEntity2.transform).size.set(200, 200);
  imageEntity2.addComponent(EventScript);

  const imageEntity3 = imageEntity2.createChild("Image3");
  const image3 = imageEntity3.addComponent(Image);
  image3.color.set(0, 0, 1, 1);
  (<UITransform>imageEntity3.transform).size.set(100, 100);
  imageEntity3.addComponent(EventScript);

  engine.resourceManager
    .load<Texture2D>({
      url: "https://mdn.alipayobjects.com/huamei_yo47yq/afts/img/A*wW-5TYANcJAAAAAAAAAAAAAADhuCAQ/original/Image.png",
      type: AssetType.Texture2D
    })
    .then((texture) => {
      const sprite = new Sprite(engine, texture);
      image1.sprite = image2.sprite = image3.sprite = sprite;
    });

  engine.run();
});

class EventScript extends Script {
  onPointerEnter(eventData: PointerEventData): void {
    console.log(this.entity.name, "onPointerEnter");
  }

  onPointerDown(eventData: PointerEventData): void {
    console.log(this.entity.name, "onPointerDown");
  }

  onPointerUp(eventData: PointerEventData): void {
    console.log(this.entity.name, "onPointerUp");
  }

  onPointerClick(eventData: PointerEventData): void {
    console.log(this.entity.name, "onPointerClick");
  }

  onPointerExit(eventData: PointerEventData): void {
    console.log(this.entity.name, "onPointerExit");
  }

  onPointerBeginDrag(eventData: PointerEventData): void {
    console.log(this.entity.name, "onPointerBeginDrag");
  }

  onPointerEndDrag(eventData: PointerEventData): void {
    console.log(this.entity.name, "onPointerEndDrag");
  }

  onPointerDrop(eventData: PointerEventData): void {
    console.log(this.entity.name, "onPointerDrop");
  }
}
