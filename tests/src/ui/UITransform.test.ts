import { Vector2 } from "@galacean/engine-math";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { UICanvas, UITransform } from "@galacean/engine-ui";
import { describe, expect, it } from "vitest";

describe("UITransform", async () => {
    const canvas = document.createElement("canvas");
    const engine = await WebGLEngine.create({ canvas: canvas });
    const webCanvas = engine.canvas;
    webCanvas.width = 750;
    webCanvas.height = 1334;
    const scene = engine.sceneManager.scenes[0];
    const root = scene.createRootEntity("root");

    const canvasEntity = root.createChild("canvas");
    canvasEntity.addComponent(UICanvas);
    const imageEntity = canvasEntity.createChild("Image");

    it("Size", () => {
        const imageTransform = <UITransform>imageEntity.transform;
        // default value is 100, 100
        expect(imageTransform.size.x).to.equal(100);
        expect(imageTransform.size.y).to.equal(100);

        imageTransform.size = new Vector2(200, 200);
        expect(imageTransform.size.x).to.equal(200);
        expect(imageTransform.size.y).to.equal(200);
    });

    it("Pivot", () => {
        const imageTransform = <UITransform>imageEntity.transform;
        // default value is 0.5, 0.5
        expect(imageTransform.pivot.x).to.equal(0.5);
        expect(imageTransform.pivot.y).to.equal(0.5);

        (<UITransform>imageEntity.transform).pivot = new Vector2(0.1, 0.1);
        expect(imageTransform.pivot.x).to.equal(0.1);
        expect(imageTransform.pivot.y).to.equal(0.1);
    });

    it("Listener", () => {
        const imageTransform = <UITransform>imageEntity.transform;
        const boolFlag = imageEntity.registerWorldChangeFlag();
        boolFlag.flag = false;

        // size
        imageTransform.size = new Vector2(300, 300);
        expect(boolFlag.flag).to.be.true;
        boolFlag.flag = false;
        imageTransform.size = new Vector2(300, 300);
        expect(boolFlag.flag).to.be.false;

        // pivot
        imageTransform.pivot = new Vector2(0.2, 0.2);
        expect(boolFlag.flag).to.be.true;
        boolFlag.flag = false;
        imageTransform.pivot = new Vector2(0.2, 0.2);
        expect(boolFlag.flag).to.be.false;
    });

    it("clone", () => {
        const imageTransform = <UITransform>imageEntity.transform;
        imageTransform.size = new Vector2(500, 500);
        imageTransform.pivot = new Vector2(0.7, 0.7);
        const cloneEntity = imageEntity.clone();
        const cloneTransform = <UITransform>cloneEntity.transform;

        expect(cloneTransform.size.x).to.equal(500);
        expect(cloneTransform.size.y).to.equal(500);
        expect(cloneTransform.pivot.x).to.equal(0.7);
        expect(cloneTransform.pivot.y).to.equal(0.7);
    })
});