import { Camera, PointerEventData, Script, Sprite, SpriteDrawMode, Texture2D } from "@galacean/engine-core";
import { Color, Vector3 } from "@galacean/engine-math";
import { WebGLEngine } from "@galacean/engine";
import {
  Button,
  ColorTransition,
  Image,
  ScaleTransition,
  SpriteTransition,
  Text,
  UICanvas,
  UIGroup,
  UITransform
} from "@galacean/engine-ui";
import { describe, expect, it, vi } from "vitest";

class ClickHandler extends Script {
  callCount = 0;
  lastPrefix = "";

  handleClick() {
    this.callCount++;
  }

  handleClickWithPrefix(event: PointerEventData, prefix: string) {
    this.callCount++;
    this.lastPrefix = prefix;
  }
}

describe("Button", async () => {
  const canvas = document.createElement("canvas");
  const engine = await WebGLEngine.create({ canvas: canvas });
  const webCanvas = engine.canvas;
  webCanvas.width = 750;
  webCanvas.height = 1334;
  const scene = engine.sceneManager.scenes[0];
  const root = scene.createRootEntity("root");

  // Create camera
  const cameraEntity = root.createChild("Camera");
  cameraEntity.transform.position = new Vector3(0, 0, 10);
  const camera = cameraEntity.addComponent(Camera);
  camera.fieldOfView = 60;
  camera.farClipPlane = 200;
  camera.nearClipPlane = 0.3;
  camera.isOrthographic = true;

  // Create group
  const canvasEntity = root.createChild("canvas");
  canvasEntity.addComponent(UIGroup);

  const commonTextEntity = canvasEntity.createChild("commonText");
  const commonText = commonTextEntity.addComponent(Text);

  // Create button
  const buttonEntity = canvasEntity.createChild("Image");
  const image = buttonEntity.addComponent(Image);
  image.drawMode = SpriteDrawMode.Sliced;
  (<UITransform>buttonEntity.transform).size.set(120, 40);
  const textEntity = buttonEntity.createChild("Text");
  (<UITransform>textEntity.transform).size.set(120, 40);
  const text = textEntity.addComponent(Text);
  text.text = "Button";
  text.color.set(0, 0, 0, 1);
  const button = buttonEntity.addComponent(Button);

  it("Set and Get", () => {
    // Click
    let clickCount = 0;
    const onClick = () => {
      clickCount++;
    };
    button.addClicked(onClick);
    button.onPointerClick(new PointerEventData());
    expect(clickCount).to.eq(1);
    button.removeClicked(onClick);
    button.onPointerClick(new PointerEventData());
    expect(clickCount).to.eq(1);

    // Transition
    const scaleTransition = new ScaleTransition();
    button.addTransition(scaleTransition);
    expect(button.transitions.length).to.eq(1);
    scaleTransition.destroy();
    expect(button.transitions.length).to.eq(0);

    // target 指向克隆节点的组件
    const colorTransition = new ColorTransition();
    colorTransition.target = image;
    colorTransition.hover = new Color(0.8, 0.8, 0.8);
    colorTransition.normal = new Color(1, 0, 0, 1);
    button.addTransition(colorTransition);

    // target 指向克隆节点子节点的组件
    const scaleTransitionOne = new ScaleTransition();
    scaleTransitionOne.target = text;
    button.addTransition(scaleTransitionOne);

    // target 指向克隆节点同级节点的组件
    const scaleTransitionTwo = new ScaleTransition();
    scaleTransitionTwo.target = commonText;
    button.addTransition(scaleTransitionTwo);
    expect(button.transitions.length).to.eq(3);
  });

  it("Interactive State", () => {
    button.onPointerBeginDrag();
    // InteractiveState.Down
    // @ts-ignore
    expect(button._getInteractiveState()).to.eq(1);
    button.onPointerEndDrag();
    // InteractiveState.Normal
    // @ts-ignore
    expect(button._getInteractiveState()).to.eq(0);
    button.onPointerEnter();
    // InteractiveState.Pressed
    // @ts-ignore
    expect(button._getInteractiveState()).to.eq(2);
    button.onPointerExit();
    // InteractiveState.Normal
    // @ts-ignore
    expect(button._getInteractiveState()).to.eq(0);
    button.interactive = false;
    // InteractiveState.Disable
    // @ts-ignore
    expect(button._getInteractiveState()).to.eq(3);
    button.interactive = true;
    // InteractiveState.Normal
    // @ts-ignore
    expect(button._getInteractiveState()).to.eq(0);
    button.entity.addComponent(UIGroup).interactive = false;
    // InteractiveState.Normal
    // @ts-ignore
    expect(button._getInteractiveState()).to.eq(0);
    canvasEntity.addComponent(UICanvas);
    // InteractiveState.Disable
    // @ts-ignore
    expect(button._getInteractiveState()).to.eq(3);
  });

  it("clone", () => {
    const cloneButtonEntity = buttonEntity.clone();
    const cloneButton = cloneButtonEntity.getComponent(Button);
    const cloneTransitions = cloneButton.transitions;
    const cloneTransition = cloneTransitions[0];
    expect(cloneTransition.target).to.eq(cloneButtonEntity.getComponent(Image));

    const cloneTransitionOne = cloneTransitions[1];
    expect(cloneTransitionOne.target).to.eq(cloneButtonEntity.findByName("Text").getComponent(Text));

    const cloneTransitionTwo = cloneTransitions[2];
    expect(cloneTransitionTwo.target).to.eq(commonText);
  });

  it("clone onClick does not copy closure listeners", () => {
    const testEntity = canvasEntity.createChild("testBtn");
    testEntity.addComponent(Image);
    (<UITransform>testEntity.transform).size.set(100, 40);
    const testButton = testEntity.addComponent(Button);

    const sourceFn = vi.fn();
    testButton.onClick.on(sourceFn);

    const cloneEntity = testEntity.clone();
    const cloneButton = cloneEntity.getComponent(Button);

    // Clone should NOT have source's closure listener
    cloneButton.onClick.invoke(new PointerEventData());
    expect(sourceFn).not.toHaveBeenCalled();

    // Source should still work
    testButton.onClick.invoke(new PointerEventData());
    expect(sourceFn).toHaveBeenCalledOnce();

    testEntity.destroy();
  });

  it("clone remaps onClick structured bindings to cloned hierarchy", () => {
    const testEntity = canvasEntity.createChild("testBtnBindings");
    testEntity.addComponent(Image);
    (<UITransform>testEntity.transform).size.set(100, 40);
    const testButton = testEntity.addComponent(Button);

    // Add handler as child
    const handlerEntity = testEntity.createChild("handler");
    const handler = handlerEntity.addComponent(ClickHandler);

    // Set up structured binding
    testButton.onClick.on(handler, "handleClick");

    // Clone
    const cloneEntity = testEntity.clone();
    const cloneButton = cloneEntity.getComponent(Button);
    const cloneHandler = cloneEntity.findByName("handler").getComponent(ClickHandler);

    // Invoke clone's onClick - should call cloned handler only
    cloneButton.onClick.invoke(new PointerEventData());
    expect(cloneHandler.callCount).toBe(1);
    expect(handler.callCount).toBe(0);

    testEntity.destroy();
  });

  it("clone preserves onClick bindings to external entities", () => {
    const testEntity = canvasEntity.createChild("testBtnExt");
    testEntity.addComponent(Image);
    (<UITransform>testEntity.transform).size.set(100, 40);
    const testButton = testEntity.addComponent(Button);

    // External handler (not a descendant of testEntity)
    const externalEntity = canvasEntity.createChild("externalHandler");
    const externalHandler = externalEntity.addComponent(ClickHandler);

    // Set up structured binding to external handler
    testButton.onClick.on(externalHandler, "handleClick");

    // Clone
    const cloneEntity = testEntity.clone();
    const cloneButton = cloneEntity.getComponent(Button);

    // Invoke clone's onClick - should call original externalHandler
    cloneButton.onClick.invoke(new PointerEventData());
    expect(externalHandler.callCount).toBe(1);

    testEntity.destroy();
    externalEntity.destroy();
  });

  it("clone onClick bindings with pre-resolved arguments", () => {
    const testEntity = canvasEntity.createChild("testBtnArgs");
    testEntity.addComponent(Image);
    (<UITransform>testEntity.transform).size.set(100, 40);
    const testButton = testEntity.addComponent(Button);

    const handlerEntity = testEntity.createChild("argsHandler");
    const handler = handlerEntity.addComponent(ClickHandler);

    // Set up structured binding with arguments
    testButton.onClick.on(handler, "handleClickWithPrefix", "myPrefix");

    // Clone
    const cloneEntity = testEntity.clone();
    const cloneButton = cloneEntity.getComponent(Button);
    const cloneHandler = cloneEntity.findByName("argsHandler").getComponent(ClickHandler);

    // Invoke clone's onClick
    cloneButton.onClick.invoke(new PointerEventData());
    expect(cloneHandler.callCount).toBe(1);
    expect(cloneHandler.lastPrefix).toBe("myPrefix");
    expect(handler.callCount).toBe(0);

    testEntity.destroy();
  });

  it("cloned interactive gets independent deep-cloned transitions with remapped targets", () => {
    const testEntity = canvasEntity.createChild("transitionClone");
    const testImage = testEntity.addComponent(Image);
    (<UITransform>testEntity.transform).size.set(100, 40);
    const testButton = testEntity.addComponent(Button);

    const transition = new ColorTransition();
    transition.target = testImage;
    transition.normal = new Color(1, 0, 0, 1);
    transition.hover = new Color(0, 1, 0, 1);
    testButton.addTransition(transition);

    const cloneEntity = testEntity.clone();
    canvasEntity.addChild(cloneEntity);
    const cloneButton = cloneEntity.getComponent(Button);
    const cloneImage = cloneEntity.getComponent(Image);

    expect(cloneButton.transitions.length).to.eq(1);
    const cloneTransition = cloneButton.transitions[0] as ColorTransition;
    // Independent instance, wired to the clone's own components.
    expect(cloneTransition).not.to.eq(transition);
    expect(cloneTransition.target).to.eq(cloneImage);
    // @ts-ignore
    expect(cloneTransition._interactive).to.eq(cloneButton);
    // State values deep cloned.
    expect(cloneTransition.normal).not.to.eq(transition.normal);
    expect(cloneTransition.normal.r).to.eq(1);
    expect(cloneTransition.hover.g).to.eq(1);

    // Destroying the clone must not strip the source button's transitions.
    cloneEntity.destroy();
    expect(testButton.transitions.length).to.eq(1);
    expect(transition.target).to.eq(testImage);

    testEntity.destroy();
  });

  it("cloned sprite transition keeps shared sprites' refCount balanced", () => {
    const testEntity = canvasEntity.createChild("spriteTransitionClone");
    const testImage = testEntity.addComponent(Image);
    const testButton = testEntity.addComponent(Button);

    const sprite = new Sprite(engine, new Texture2D(engine, 1, 1));
    const transition = new SpriteTransition();
    transition.target = testImage;
    transition.normal = sprite;
    testButton.addTransition(transition);
    const baseline = sprite.refCount;

    const cloneEntity = testEntity.clone();
    canvasEntity.addChild(cloneEntity);
    // +1 by the cloned transition (acquired in _cloneTo), +1 by the cloned Image
    // (transition._applyValue assigns the sprite through the Image.sprite setter on activation).
    expect(sprite.refCount).to.eq(baseline + 2);

    cloneEntity.destroy();
    expect(sprite.refCount).to.eq(baseline);

    testEntity.destroy();
    expect(sprite.refCount).to.eq(baseline - 2);
  });
});
