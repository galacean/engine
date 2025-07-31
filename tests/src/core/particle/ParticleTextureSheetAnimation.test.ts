
import { Camera, ParticleRenderer, Scene } from "@galacean/engine-core";
import { Vector2 } from "@galacean/engine-math";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { beforeAll, describe, expect, it } from "vitest";

describe("TextureSheetAnimation Test", () => {
    let engine: WebGLEngine;
    let scene: Scene;
    let renderer: ParticleRenderer;

    beforeAll(async function () {
        engine = await WebGLEngine.create({
            canvas: document.createElement("canvas")
        });

        scene = engine.sceneManager.activeScene;
        const rootEntity = scene.createRootEntity("root");

        const cameraEntity = rootEntity.createChild("Camera");
        cameraEntity.addComponent(Camera);
        cameraEntity.transform.setPosition(0, 0, 10);

        renderer = scene.createRootEntity("Renderer").addComponent(ParticleRenderer);
        engine.run();
    });
    it("Tiling", () => {
        const textureSheetAnimation = renderer.generator.textureSheetAnimation;
        textureSheetAnimation.tiling = new Vector2(2, 2);
        expect(textureSheetAnimation.tiling).to.deep.include({ x: 2, y: 2 });
        // @ts-ignore
        expect(textureSheetAnimation._tillingInfo).to.deep.include({ x: 0.5, y: 0.5, z: 4 });

        textureSheetAnimation.tiling.set(1, 1);
        expect(textureSheetAnimation.tiling).to.deep.include({ x: 1, y: 1 });
        // @ts-ignore
        expect(textureSheetAnimation._tillingInfo).to.deep.include({ x: 1, y: 1, z: 1 });
    });

    it("Clone", () => {
        const textureSheetAnimation = renderer.generator.textureSheetAnimation;
        textureSheetAnimation.tiling = new Vector2(4, 4);
        const cloneTextureSheetAnimation = renderer.entity.clone().getComponent(ParticleRenderer).generator.textureSheetAnimation;
        expect(cloneTextureSheetAnimation.tiling).to.deep.include({ x: 4, y: 4 });
        // @ts-ignore
        expect(cloneTextureSheetAnimation.tiling._onValueChanged).to.not.equal(textureSheetAnimation.tiling._onValueChanged);
        // @ts-ignore
        expect(cloneTextureSheetAnimation._tillingInfo).to.deep.include({ x: 0.25, y: 0.25, z: 16 });
    })
}); 