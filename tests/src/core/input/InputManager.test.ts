import {
  PointerButton,
  PointerPhase,
  Script,
  Keys,
  Camera,
  StaticCollider,
  BoxColliderShape,
  Pointer
} from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { Vector2, Vector3 } from "@galacean/engine-math";
import { LitePhysics } from "@galacean/engine-physics-lite";
import chai, { expect } from "chai";
import spies from "chai-spies";

chai.use(spies);

const body = document.getElementsByTagName("body")[0];
const canvasDOM = document.createElement("canvas");
canvasDOM.style.width = "5px";
canvasDOM.style.height = "5px";
body.appendChild(canvasDOM);

describe("InputManager", async () => {
  const engine = await WebGLEngine.create({ canvas: canvasDOM, physics: new LitePhysics() });
  const { inputManager, canvas } = engine;
  canvas.resizeByClientSize(2);
  const scene = engine.sceneManager.scenes[0];
  const root = scene.createRootEntity("root");

  it("Constructor", () => {
    // @ts-ignore
    expect(inputManager._pointerManager).not.to.eq(undefined);
    // @ts-ignore
    expect(inputManager._wheelManager).not.to.eq(undefined);
    // @ts-ignore
    expect(inputManager._keyboardManager).not.to.eq(undefined);
    // @ts-ignore
    expect(inputManager._initialized).to.eq(true);
    // @ts-ignore
    expect(inputManager._engine).to.deep.eq(engine);
  });

  it("multiPointerEnabled", () => {
    inputManager.multiPointerEnabled = false;
    expect(inputManager.multiPointerEnabled).to.eq(false);
    inputManager.multiPointerEnabled = true;
    expect(inputManager.multiPointerEnabled).to.eq(true);
  });

  it("pointer", () => {
    // @ts-ignore
    inputManager._onFocus();
    canvasDOM.dispatchEvent(generatePointerEvent("pointerdown", 1, 1, 1));
    canvasDOM.dispatchEvent(generatePointerEvent("pointermove", 1, 1, 1));
    canvasDOM.dispatchEvent(generatePointerEvent("pointerup", 1, 1, 1, 0, 0));
    canvasDOM.dispatchEvent(generatePointerEvent("pointerleave", 1, 1, 1, -1, 0));
    canvasDOM.dispatchEvent(generatePointerEvent("pointercancel", 1, 1, 1, -1, 0));
    engine.update();
    const pointers = inputManager.pointers;
    expect(pointers.length).to.eq(1);
    // @ts-ignore
    expect(inputManager._pointerManager._nativeEvents.length).to.eq(0);
    if (pointers.length > 0) {
      const pointer = pointers[0];
      // @ts-ignore
      expect(pointer._uniqueID).to.eq(1);
      expect(pointer.button).to.eq(PointerButton.None);
      expect(pointer.pressedButtons).to.eq(PointerButton.None);
      const { left, top } = canvasDOM.getBoundingClientRect();
      expect(pointer.position).to.deep.eq(new Vector2((1 - left) * 2, (1 - top) * 2));
      expect(pointer.phase).to.eq(PointerPhase.Leave);
      expect(inputManager.isPointerDown()).to.eq(true);
      expect(inputManager.isPointerUp()).to.eq(true);
      expect(inputManager.isPointerHeldDown()).to.eq(false);
      expect(inputManager.isPointerDown(PointerButton.Primary)).to.eq(true);
      expect(inputManager.isPointerUp(PointerButton.Primary)).to.eq(true);
      expect(inputManager.isPointerHeldDown(PointerButton.Primary)).to.eq(false);
    }

    const cameraEntity = root.createChild("camera");
    cameraEntity.transform.setPosition(0, 0, 1);
    cameraEntity.addComponent(Camera);

    const boxEntity = root.createChild("box");
    const collider = boxEntity.addComponent(StaticCollider);
    const boxShape = new BoxColliderShape();
    boxShape.size = new Vector3(10, 10, 10);
    collider.addShape(boxShape);

    class TestScript extends Script {
      onPointerEnter(pointer: Pointer): void {
        console.log("onPointerEnter");
      }

      onPointerExit(pointer: Pointer): void {
        console.log("onPointerExit");
      }

      onPointerDown(pointer: Pointer): void {
        console.log("onPointerDown");
      }

      onPointerClick(pointer: Pointer): void {
        console.log("onPointerClick");
      }

      onPointerDrag(pointer: Pointer): void {
        console.log("onPointerDrag");
      }

      onPointerUp(pointer: Pointer): void {
        console.log("onPointerUp");
      }
    }
    TestScript.prototype.onPointerEnter = chai.spy(TestScript.prototype.onPointerEnter);
    TestScript.prototype.onPointerExit = chai.spy(TestScript.prototype.onPointerExit);
    TestScript.prototype.onPointerDown = chai.spy(TestScript.prototype.onPointerDown);
    TestScript.prototype.onPointerClick = chai.spy(TestScript.prototype.onPointerClick);
    TestScript.prototype.onPointerDrag = chai.spy(TestScript.prototype.onPointerDrag);
    TestScript.prototype.onPointerUp = chai.spy(TestScript.prototype.onPointerUp);
    const script = boxEntity.addComponent(TestScript);

    // @ts-ignore
    inputManager._onFocus();
    const { left, top } = canvasDOM.getBoundingClientRect();
    canvasDOM.dispatchEvent(generatePointerEvent("pointerdown", 2, left + 2, top + 2));
    engine.update();

    expect(script.onPointerEnter).to.have.been.called.exactly(1);
    expect(script.onPointerExit).to.have.been.called.exactly(0);
    expect(script.onPointerDown).to.have.been.called.exactly(1);
    expect(script.onPointerClick).to.have.been.called.exactly(0);
    expect(script.onPointerDrag).to.have.been.called.exactly(0);
    expect(script.onPointerUp).to.have.been.called.exactly(0);

    // @ts-ignore
    inputManager._onFocus();
    canvasDOM.dispatchEvent(generatePointerEvent("pointermove", 2, left + 2, top + 2));
    canvasDOM.dispatchEvent(generatePointerEvent("pointerup", 2, left + 2, top + 2, 0, 0));
    canvasDOM.dispatchEvent(generatePointerEvent("pointerleave", 2, left + 2, top + 2, -1, 0));
    engine.update();
    expect(script.onPointerEnter).to.have.been.called.exactly(1);
    expect(script.onPointerExit).to.have.been.called.exactly(1);
    expect(script.onPointerDown).to.have.been.called.exactly(1);
    expect(script.onPointerClick).to.have.been.called.exactly(1);
    expect(script.onPointerDrag).to.have.been.called.exactly(1);
    expect(script.onPointerUp).to.have.been.called.exactly(1);

    // @ts-ignore
    inputManager._onFocus();
    canvasDOM.dispatchEvent(generatePointerEvent("pointerdown", 3, left + 200, top + 200));
    canvasDOM.dispatchEvent(generatePointerEvent("pointerup", 3, left + 200, top + 200, 0, 0));
    canvasDOM.dispatchEvent(generatePointerEvent("pointerleave", 3, left + 200, top + 200, -1, 0));
    engine.update();
    expect(script.onPointerEnter).to.have.been.called.exactly(1);
    expect(script.onPointerExit).to.have.been.called.exactly(1);
    expect(script.onPointerDown).to.have.been.called.exactly(1);
    expect(script.onPointerClick).to.have.been.called.exactly(1);
    expect(script.onPointerDrag).to.have.been.called.exactly(1);
    expect(script.onPointerUp).to.have.been.called.exactly(1);

    // @ts-ignore
    inputManager._onFocus();
    canvasDOM.dispatchEvent(generatePointerEvent("pointerdown", 4, 0, 0));
    engine.update();
    const deltaPosition = engine.inputManager.pointers[0].deltaPosition;
    expect(deltaPosition).deep.equal(new Vector2(0, 0));
  });

  it("keyboard", () => {
    // @ts-ignore
    inputManager._onFocus();
    canvasDOM.dispatchEvent(generateKeyboardEvent("keydown", "KeyA"));
    canvasDOM.dispatchEvent(generateKeyboardEvent("keydown", "KeyB"));
    canvasDOM.dispatchEvent(generateKeyboardEvent("keyup", "KeyA"));
    engine.update();
    expect(inputManager.isKeyDown()).to.eq(true);
    expect(inputManager.isKeyUp()).to.eq(true);
    expect(inputManager.isKeyHeldDown()).to.eq(true);
    expect(inputManager.isKeyDown(Keys.KeyA)).to.eq(true);
    expect(inputManager.isKeyUp(Keys.KeyA)).to.eq(true);
    expect(inputManager.isKeyHeldDown(Keys.KeyA)).to.eq(false);
    expect(inputManager.isKeyDown(Keys.KeyB)).to.eq(true);
    expect(inputManager.isKeyUp(Keys.KeyB)).to.eq(false);
    expect(inputManager.isKeyHeldDown(Keys.KeyB)).to.eq(true);
    // @ts-ignore
    inputManager._onFocus();
    canvasDOM.dispatchEvent(generateKeyboardEvent("keyup", "KeyB"));
    engine.update();
    expect(inputManager.isKeyUp(Keys.KeyB)).to.eq(true);
    expect(inputManager.isKeyHeldDown(Keys.KeyB)).to.eq(false);

    canvasDOM.dispatchEvent(generateKeyboardEvent("keydown", "KeyA"));
    canvasDOM.dispatchEvent(generateKeyboardEvent("keyup", "MetaRight"));
    expect(inputManager.isKeyHeldDown(Keys.KeyA)).to.eq(false);
  });

  it("wheel", () => {
    // @ts-ignore
    inputManager._onFocus();
    canvasDOM.dispatchEvent(generateWheelEvent(1, 2, 3));
    engine.update();
    expect(inputManager.wheelDelta).to.deep.eq(new Vector3(1, 2, 3));
  });

  it("blur and focus", () => {
    // @ts-ignore
    inputManager._onFocus();
    window.dispatchEvent(new Event("blur"));
    // @ts-ignore
    expect(inputManager._pointerManager._hadListener).to.eq(false);
    // @ts-ignore
    expect(inputManager._wheelManager._hadListener).to.eq(false);
    // @ts-ignore
    expect(inputManager._keyboardManager._hadListener).to.eq(false);

    window.dispatchEvent(new Event("focus"));
    // @ts-ignore
    expect(inputManager._pointerManager._hadListener).to.eq(true);
    // @ts-ignore
    expect(inputManager._wheelManager._hadListener).to.eq(true);
    // @ts-ignore
    expect(inputManager._keyboardManager._hadListener).to.eq(true);
  });

  it("destroy", () => {
    // @ts-ignore
    const wheel = inputManager._wheelManager;
    // @ts-ignore
    const pointer = inputManager._pointerManager;
    // @ts-ignore
    const keyboard = inputManager._keyboardManager;

    engine.destroy();
    window.dispatchEvent(new Event("focus"));
    expect(pointer._hadListener).to.eq(false);
    expect(wheel._hadListener).to.eq(false);
    expect(keyboard._hadListener).to.eq(false);
    // @ts-ignore
    expect(inputManager._pointerManager).to.eq(null);
    // @ts-ignore
    expect(inputManager._wheelManager).to.eq(null);
    // @ts-ignore
    expect(inputManager._keyboardManager).to.eq(null);

    expect(pointer._pointerPool).to.eq(null);
    expect(pointer._pointers).to.eq(null);
    expect(pointer._downList).to.eq(null);
    expect(pointer._upList).to.eq(null);
    expect(pointer._nativeEvents).to.eq(null);
    expect(pointer._upMap).to.eq(null);
    expect(pointer._downMap).to.eq(null);
    expect(pointer._htmlCanvas).to.eq(null);
    expect(pointer._canvas).to.eq(null);
    expect(pointer._engine).to.eq(null);

    expect(wheel._delta).to.eq(null);
    expect(wheel._nativeEvents).to.eq(null);
    expect(wheel._canvas).to.eq(null);

    expect(keyboard._curHeldDownKeyToIndexMap).to.eq(null);
    expect(keyboard._upKeyToFrameCountMap).to.eq(null);
    expect(keyboard._downKeyToFrameCountMap).to.eq(null);
    expect(keyboard._nativeEvents).to.eq(null);
    expect(keyboard._curFrameHeldDownList).to.eq(null);
    expect(keyboard._curFrameDownList).to.eq(null);
    expect(keyboard._curFrameUpList).to.eq(null);
    expect(keyboard._htmlCanvas).to.eq(null);
    expect(keyboard._engine).to.eq(null);
  });
});

function generatePointerEvent(
  type: string,
  pointerId: number,
  clientX: number,
  clientY: number,
  button: number = 0,
  buttons: number = 1
) {
  return new PointerEvent(type, { pointerId, clientX, clientY, button, buttons });
}

function generateKeyboardEvent(type: string, code: string) {
  return new KeyboardEvent(type, { code });
}

function generateWheelEvent(deltaX: number, deltaY: number, deltaZ: number) {
  return new WheelEvent("wheel", { deltaX, deltaY, deltaZ });
}
