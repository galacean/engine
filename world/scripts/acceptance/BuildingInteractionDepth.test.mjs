import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "@playwright/test";

test(
  "world framebuffer depth preserves visibility, camera state and bounded resources",
  { timeout: 120000 },
  async () => {
    let server;
    const url =
      process.env.WORLD_TEST_URL ??
      (await (async () => {
        server = await createServer({
          configFile: fileURLToPath(new URL("../../vite.config.mjs", import.meta.url)),
          server: { port: 0, open: false }
        });
        await server.listen();
        return server.resolvedUrls.local[0];
      })());
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    try {
      const page = await browser.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(String(error)));
      await page.route("**/__building_depth_test__", (route) =>
        route.fulfill({ contentType: "text/html", body: '<canvas id="canvas" width="800" height="600"></canvas>' })
      );
      await page.goto(new URL("/__building_depth_test__", url).href);
      const result = await page.evaluate(async () => {
        const E = await import("/packages/galacean/src/index.ts");
        const { ShaderCompiler } = await import("/packages/shader-compiler/src/index.ts");
        const { SeedWorldPicker } = await import("/packages/world-planning/src/world/SeedWorldPicker.ts");
        const engine = await E.WebGLEngine.create({
          canvas: document.querySelector("canvas"),
          shaderCompiler: new ShaderCompiler()
        });
        const scene = engine.sceneManager.activeScene;
        const camera = scene.createRootEntity("camera").addComponent(E.Camera);
        camera.nearClipPlane = 0.1;
        camera.farClipPlane = 200;
        camera.entity.transform.lookAt(new E.Vector3(0, 0, -1));
        const box = (name, z) => {
          const entity = scene.createRootEntity(name),
            renderer = entity.addComponent(E.MeshRenderer);
          renderer.mesh = E.PrimitiveMesh.createCuboid(engine, 1, 1, 1);
          renderer.setMaterial(new E.UnlitMaterial(engine));
          entity.transform.setPosition(0, 0, z);
          return renderer;
        };
        const renderer = box("building", -10),
          other = box("unregistered foreground", -3);
        const picker = new SeedWorldPicker(camera);
        const ray = new E.Ray(new E.Vector3(), new E.Vector3(0, 0, -1));
        const visit = (visitor) => visitor({ renderer, count: 1, resolve: () => "building" });
        const projection = Array.from(camera.projectionMatrix.elements);
        const boundary = new AbortController();
        let frameReady = false;
        const nextFrame = picker.waitForFrame(boundary.signal).then(() => {
          frameReady = true;
        });
        await Promise.resolve();
        const waitsForRender = !frameReady;
        engine.update();
        await nextFrame;
        const cancelled = new AbortController();
        const cancelWait = picker.waitForFrame(cancelled.signal).then(
          () => false,
          () => true
        );
        cancelled.abort();
        const cancelsFrameWait = await cancelWait;
        const frame = renderer._renderFrameCount;
        try {
          const center = await picker.depthAlongRay(visit, ray);
          const ignoreCover = (visitor) => {
            visit(visitor);
            visitor({ renderer: other, count: 1, interactionOccluder: false, resolve: () => "grass" });
          };
          const throughGroundCover = await picker.depthAlongRay(ignoreCover, ray);
          const ownTarget = scene.createRootEntity("operated crop anchor");
          ownTarget.addChild(other.entity);
          const throughOwnTarget = await picker.depthAlongRay(visit, ray, undefined, ownTarget);
          const stillBlockedWithoutExclusion = await picker.depthAlongRay(visit, ray);
          other.entity.transform.setPosition(5, 0, -3);
          const held = box("held tool", -1);
          camera.entity.addChild(held.entity);
          const throughHeld = await picker.depthAlongRay(visit, ray);
          const particle = scene.createRootEntity("active rain").addComponent(E.ParticleRenderer);
          particle.generator.main.playOnEnabled = false;
          particle.generator.play();
          particle.generator.emit(10);
          particle.setMaterial(new E.ParticleMaterial(engine));
          const beforeParticles = particle.generator._firstFreeElement - particle.generator._firstActiveElement;
          await picker.depthAlongRay(visit, ray);
          const particles = {
            before: beforeParticles,
            after: particle.generator._firstFreeElement - particle.generator._firstActiveElement,
            playing: particle.generator._isPlaying
          };
          particle.entity.destroy();
          renderer.entity.transform.setPosition(5, 0, -10);
          const miss = await picker.depthAlongRay(visit, ray);
          const offRay = new E.Ray(new E.Vector3(), new E.Vector3(5, 0, -10).normalize());
          const offaxis = await picker.depthAlongRay(visit, offRay);
          renderer.enabled = false;
          const hidden = await picker.depthAlongRay(visit, offRay);
          renderer.enabled = true;
          renderer.entity.transform.setPosition(0, 0, -10);
          const material = renderer.getMaterial();
          const alpha = new E.Texture2D(engine, 1, 1, E.TextureFormat.R8G8B8A8, false, false);
          alpha.setPixelBuffer(new Uint8Array([255, 255, 255, 0]));
          material.baseTexture = alpha;
          material.alphaCutoff = 0.5;
          const cutout = await picker.depthAlongRay(visit, ray);
          material.baseTexture = null;
          material.alphaCutoff = 0;
          await picker.depthAlongRay(visit, ray);
          let renders = 0;
          const originalRender = picker.render.bind(picker);
          picker.render = (...args) => {
            renders++;
            return originalRender(...args);
          };
          const rays = [ray, new E.Ray(new E.Vector3(), new E.Vector3(0.1, 0.1, -10).normalize())];
          const singles = [];
          for (const r of rays) singles.push(await picker.depthAlongRay(visit, r));
          const beforeBatch = renders;
          const batch = await picker.depthAlongRays(
            visit,
            rays.map((ray) => ({ ray }))
          );
          const batchRenders = renders - beforeBatch;
          const batchBytes = engine._renderingStatistics._textureMemory;
          for (let i = 0; i < 8; i++)
            await picker.depthAlongRays(
              visit,
              rays.map((ray) => ({ ray }))
            );
          const stableBatchBytes = engine._renderingStatistics._textureMemory === batchBytes;
          const beforePolicies = renders;
          const policies = await picker.depthAlongRays(visit, [{ ray }, { ray, ignoredRoot: renderer.entity }]);
          const policyRenders = renders - beforePolicies;
          const beforeEarly = renders;
          const early = await picker.depthAlongRays(
            visit,
            [{ ray }, { ray, ignoredRoot: renderer.entity }],
            undefined,
            () => true
          );
          const earlyRenders = renders - beforeEarly;
          const wide = [-3, 3].map((x) => new E.Ray(new E.Vector3(), new E.Vector3(x, 2, -4).normalize()));
          const beforeWide = renders;
          const wideDepths = await picker.depthAlongRays(
            visit,
            wide.map((ray) => ({ ray }))
          );
          const wideRenders = renders - beforeWide;
          const cancelledBatch = new AbortController();
          cancelledBatch.abort();
          let batchCancelled = false;
          try {
            await picker.depthAlongRays(
              visit,
              rays.map((ray) => ({ ray })),
              cancelledBatch.signal
            );
          } catch {
            batchCancelled = true;
          }
          await picker.depthAlongRay(visit, ray);
          const bytes = engine._renderingStatistics._textureMemory;
          for (let i = 0; i < 8; i++) await picker.depthAlongRay(visit, ray);
          const stableBytes = engine._renderingStatistics._textureMemory === bytes;
          const preservedFrame = renderer._renderFrameCount === frame;
          const sourceRenderer = box("source-owned shrub batch", -4);
          sourceRenderer.enabled = false;
          const registration = camera.registerRenderViewCullingSource({
            cull: (context) => context.submit(sourceRenderer)
          });
          engine.update();
          const sourceFrame = sourceRenderer._renderFrameCount;
          const sourceDepth = await picker.depthAlongRay(visit, ray);
          const sourcePreserved = !sourceRenderer.enabled && sourceRenderer._renderFrameCount === sourceFrame;
          registration.unregister();
          sourceRenderer.entity.destroy();
          engine.update();
          engine.resourceManager.gc();
          engine.update(); // gc clears engine pools; normal update resets their allocation cursors.
          const afterGC = await picker.depthAlongRay(visit, ray);
          const restored =
            camera.renderTarget === null &&
            renderer.enabled &&
            other.enabled &&
            projection.every((v, i) => v === camera.projectionMatrix.elements[i]);
          // Different screen rows and depths expose a mirrored texture lookup;
          // points on the same planar face cannot detect that error.
          renderer.entity.transform.setPosition(40, 0, -10);
          other.entity.transform.setPosition(40, 0, -3);
          const upper = box("upper near blocker", -8),
            lower = box("lower far blocker", -12);
          upper.entity.transform.setPosition(0, 1, -8);
          lower.entity.transform.setPosition(0, -1, -12);
          const asymmetricRays = [new E.Vector3(0, 1, -8), new E.Vector3(0, -1, -12)].map(
            (direction) => new E.Ray(new E.Vector3(), direction.normalize())
          );
          const asymmetricSingles = [];
          for (const r of asymmetricRays) asymmetricSingles.push(await picker.depthAlongRay(() => {}, r));
          const beforeAsymmetric = renders;
          const asymmetricBatch = await picker.depthAlongRays(
            () => {},
            asymmetricRays.map((ray) => ({ ray }))
          );
          const asymmetricRenders = renders - beforeAsymmetric;
          const asymmetricEarly = await picker.depthAlongRays(
            () => {},
            asymmetricRays.map((ray) => ({ ray })),
            undefined,
            (distance) => distance >= 9
          );
          return {
            asymmetricSingles,
            asymmetricBatch,
            asymmetricEarly,
            asymmetricRenders,
            early,
            earlyRenders,
            singles,
            batch,
            batchRenders,
            stableBatchBytes,
            policies,
            policyRenders,
            wideDepths,
            wideRenders,
            batchCancelled,
            waitsForRender,
            cancelsFrameWait,
            throughGroundCover,
            throughOwnTarget,
            stillBlockedWithoutExclusion,
            sourceDepth,
            sourcePreserved,
            preservedFrame,
            center,
            throughHeld,
            particles,
            afterGC,
            miss,
            offaxis,
            hidden,
            cutout,
            stableBytes,
            restored
          };
        } finally {
          picker.dispose();
          engine.destroy();
        }
      });
      const expectedAsymmetric = [(Math.sqrt(65) * 7.5) / 8, (Math.sqrt(145) * 11.5) / 12];
      for (let i = 0; i < 2; i++) {
        assert.ok(Math.abs(result.asymmetricSingles[i] - expectedAsymmetric[i]) < 0.02);
        assert.ok(Math.abs(result.asymmetricBatch[i] - expectedAsymmetric[i]) < 0.02);
      }
      assert.deepEqual(
        result.asymmetricBatch.map((depth) => depth < 9),
        [true, false]
      );
      assert.deepEqual(result.asymmetricEarly, result.asymmetricBatch);
      assert.equal(result.asymmetricRenders, 1);
      assert.equal(result.batchRenders, 1);
      assert.equal(result.stableBatchBytes, true);
      result.batch.forEach((v, i) => assert.ok(Math.abs(v - result.singles[i]) < 0.0001, JSON.stringify(result)));
      assert.equal(result.policyRenders, 2);
      assert.equal(result.earlyRenders, 1);
      assert.equal(result.early[1], undefined);
      assert.ok(Math.abs(result.policies[0] - 9.5) < 0.01);
      assert.equal(result.policies[1], Infinity);
      assert.equal(result.wideRenders, 2);
      assert.deepEqual(result.wideDepths, [Infinity, Infinity]);
      assert.equal(result.batchCancelled, true);
      assert.ok(Math.abs(result.center - 2.5) < 0.01, JSON.stringify(result));
      assert.ok(Math.abs(result.throughGroundCover - 9.5) < 0.01);
      assert.ok(Math.abs(result.throughOwnTarget - 9.5) < 0.01);
      assert.ok(Math.abs(result.stillBlockedWithoutExclusion - 2.5) < 0.01);
      assert.ok(Math.abs(result.throughHeld - 9.5) < 0.01);
      assert.equal(result.particles.before, 10);
      assert.equal(result.particles.after, 10);
      assert.equal(result.particles.playing, true);
      assert.ok(Math.abs(result.afterGC - 9.5) < 0.01);
      assert.equal(result.miss, Infinity);
      assert.ok(Math.abs(result.offaxis - Math.sqrt(125) * 0.95) < 0.02);
      assert.equal(result.hidden, Infinity);
      assert.equal(result.cutout, Infinity);
      assert.ok(Math.abs(result.sourceDepth - 3.5) < 0.01);
      assert.equal(result.sourcePreserved, true);
      assert.equal(result.waitsForRender, true);
      assert.equal(result.cancelsFrameWait, true);
      assert.equal(result.stableBytes, true);
      assert.equal(result.preservedFrame, true);
      assert.equal(result.restored, true);
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
      await server?.close();
    }
  }
);
