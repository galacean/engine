import { nativeAssets } from "./fixtures/constructionAssets.ts";
import { test } from "vitest";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  whiteMasonryTexture,
  whiteMasonryVertexColors,
  srgbToLinear,
  masonryAppearance,
  masonryTintRoles,
  isMasonryBaseTexture,
  injectMasonryTint,
  restoreMasonryTextureSamples,
  masonryFamilyTint,
  masonryTextureColors,
  masonryVertexTintTag
} from "../src/tiny-glade/runtime/MasonryAppearance.ts";
import { appendDecorationRenderPackage } from "../src/tiny-glade/runtime/ConstructionDecorationRender.ts";
import { injectConstructionDecorationLighting } from "../src/tiny-glade/runtime/ConstructionDecorationLightShader.ts";
import { masonrySourcePalette, masonryColorSeed } from "../src/tiny-glade/runtime/MasonryColorRules.ts";
import { constructionPlasterFinishGLSL } from "../src/tiny-glade/runtime/ConstructionPlasterShader.ts";
import { constructionDecorationGLSL } from "../src/tiny-glade/runtime/ConstructionDecorationShader.ts";

test("white base preserves relative linear texture detail, layer white point and mip exposure", () => {
  const spec = { width: 2, height: 1, layers: 2, srgb: true };
  const source = [
    new Uint8Array([200, 100, 50, 255, 100, 50, 25, 128, 20, 80, 160, 255, 10, 40, 80, 255]),
    new Uint8Array([150, 75, 37, 200, 15, 60, 120, 255])
  ];
  const before = source.map((x) => x.slice());
  const gray = whiteMasonryTexture(spec, source);
  const luma = (data, i) =>
    [0.2126, 0.7152, 0.0722].reduce((sum, weight, k) => sum + weight * srgbToLinear(data[i + k] / 255), 0);
  for (let mip = 0; mip < source.length; mip++)
    for (let layer = 0; layer < 2; layer++) {
      const pixels = mip === 0 ? 2 : 1;
      for (let p = 0; p < pixels; p++) {
        const i = (layer * pixels + p) * 4;
        assert.equal(gray[mip][i], gray[mip][i + 1]);
        assert.equal(gray[mip][i], gray[mip][i + 2]);
        assert.equal(gray[mip][i + 3], source[mip][i + 3]);
        assert.ok(
          Math.abs(srgbToLinear(gray[mip][i] / 255) - luma(source[mip], i) / luma(source[0], layer * 8)) < 0.005
        );
      }
    }
  assert.equal(gray[0][0], 255);
  assert.ok(gray[0][4] < 255 && gray[0][4] > 0);
  assert.deepEqual(source, before);
  assert.throws(() => whiteMasonryTexture(spec, [new Uint8Array(3)]), /mip size/);
  assert.deepEqual(
    whiteMasonryTexture({ width: 1, height: 1, layers: 1, srgb: false }, [new Uint8Array([0, 0, 0, 255])])[0],
    new Uint8Array([0, 0, 0, 255])
  );
});

test("scene tint defaults to source colors, survives late subscriptions and releases consumers independently", () => {
  const scope = {},
    a = masonryAppearance(scope);
  assert.equal(a, masonryAppearance(scope));
  for (const role of masonryTintRoles) assert.equal(a.isOverridden(role), false);
  a.registerSourceReference(0);
  const original = a.color("brick");
  a.registerSourceReference(123);
  assert.equal(a.color("brick"), original);
  assert.equal(a.referenceSeed, 0);
  let notifications = 0;
  const subscription = a.subscribe(() => notifications++);
  a.setColor("brick", "#804020");
  assert.equal(notifications, 2);
  let late;
  const lateSubscription = a.subscribe(() => {
    late = a.linearColor("brick");
  });
  assert.deepEqual(
    late,
    [128, 64, 32].map((v) => srgbToLinear(v / 255))
  );
  subscription.destroy();
  a.setColor("brick", "#ffffff");
  assert.equal(notifications, 2);
  assert.deepEqual(late, [1, 1, 1]);
  a.reset();
  assert.equal(a.isOverridden("brick"), false);
  assert.equal(a.color("brick"), original);
  lateSubscription.destroy();
  assert.equal(masonryAppearance({}).color("brick"), "#ffffff");
  assert.throws(() => a.setColor("brick", "red"), /Invalid/);
});

test("merged decorations tint wood/support while retaining glass, emission and source geometry", async () => {
  const positions = [0, 0, 0, 1, 0, 0, 0, 1, 0],
    normals = [0, 0, 1, 0, 0, 1, 0, 0, 1];
  const parts = ["wooden_plank", "brick", undefined].map((tintRole, i) => ({
    id: String(i),
    ownerId: "building",
    kind: "decoration",
    tintRole,
    positions,
    normals,
    colors: [0.8, 0.4, 0.2, 0.4, 0.2, 0.1, 0.2, 0.1, 0.05],
    emission: [0, 0, 2],
    indices: [0, 1, 2]
  }));
  parts[0].tintMask = [true, false, true];
  assert.deepEqual(
    whiteMasonryVertexColors(parts[0].colors, parts[0].tintMask).slice(3, 6),
    parts[0].colors.slice(3, 6)
  );
  const before = structuredClone(parts);
  for (const whiteBase of [false, true]) {
    const result = appendDecorationRenderPackage(
      {
        package: { whiteBase, nativeAssets, programs: {}, draws: [], textures: {} },
        dynamicFiles: [],
        asset: async () => {
          throw Error("Unexpected asset");
        }
      },
      parts
    );
    assert.equal(result.package.draws.length, 1);
    const draw = result.package.draws[0],
      floats = draw.attributes.find(a => a.location === 0).stride / Float32Array.BYTES_PER_ELEMENT;
    assert.equal(draw.attributes.find(a => a.location === 0).stride, floats * 4);
    const vertices = new Float32Array(await result.asset(draw.attributes.find(a => a.location === 0).file));
    parts.forEach((part, partIndex) => {
      const colors = whiteBase && part.tintRole ? whiteMasonryVertexColors(part.colors, part.tintMask) : part.colors;
      for (let i = 0; i < 3; i++) {
        const start = (partIndex * 3 + i) * floats;
        assert.deepEqual([...vertices.slice(start, start + 3)], positions.slice(i * 3, i * 3 + 3));
        assert.deepEqual([...vertices.slice(start + 3, start + 6)], normals.slice(i * 3, i * 3 + 3));
        for (let k = 0; k < 3; k++) assert.ok(Math.abs(vertices[start + 6 + k] - colors[i * 3 + k]) < 1e-6);
        assert.equal(vertices[start + 9], part.emission[i]);
        if (whiteBase)
          assert.equal(
            vertices[start + draw.attributes.find((a) => a.location === 7).offset / 4],
            part.tintRole && part.tintMask?.[i] !== false ? masonryTintRoles.indexOf(part.tintRole) : -1
          );
        if (whiteBase)
          for (let k = 0; k < 3; k++)
            assert.ok(
              Math.abs(
                vertices[start + 6 + k] *
                  vertices[start + draw.attributes.find((a) => a.location === 8).offset / 4 + k] -
                  part.colors[i * 3 + k]
              ) < 1e-6
            );
      }
    });
  }
  assert.deepEqual(parts, before);
});



test("neutral texture times extracted Color reconstructs a separable source, including independent layers", () => {
  const spec = { width: 3, height: 1, layers: 2, srgb: false };
  const source = new Uint8Array([
    200, 100, 50, 255, 100, 50, 25, 255, 40, 20, 10, 255, 25, 75, 125, 255, 50, 150, 250, 255, 10, 30, 50, 255
  ]);
  const white = whiteMasonryTexture(spec, [source])[0],
    colors = masonryTextureColors(spec, source);
  for (let layer = 0; layer < spec.layers; layer++)
    for (let p = 0; p < 3; p++)
      for (let k = 0; k < 3; k++) {
        const i = (layer * 3 + p) * 4;
        assert.ok(Math.abs((white[i] / 255) * colors[layer * 4 + k] - source[i + k] / 255) < 1 / 255);
      }
  assert.notDeepEqual([...colors.slice(0, 3)], [...colors.slice(4, 7)]);
});

test("distance decoration metadata recovers neutral brightness without changing original colors", () => {
  const colors = [0.8, 0.4, 0.2, 0.4, 0.2, 0.1, 0, 0, 0],
    neutral = whiteMasonryVertexColors(colors);
  for (let role = 0; role < 3; role++)
    for (let vertex = 0; vertex < 3; vertex++) {
      const rgb = colors.slice(vertex * 3, vertex * 3 + 3),
        gray = neutral.slice(vertex * 3, vertex * 3 + 3);
      const tag = Math.fround(masonryVertexTintTag(role, rgb, gray));
      assert.equal(Math.floor(tag) - 1, role);
      const fraction = tag - Math.floor(tag);
      const decoded =
        fraction > 0 ? ((rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722) * (1 - fraction)) / fraction : 0;
      assert.ok(Math.abs(decoded - gray[0]) < 1e-5);
    }
});



test("resident decoration geometry stays independent of palette seed and preserves source/glass fallback", async () => {
  const part = {
    id: "frame",
    ownerId: "house",
    kind: "decoration",
    tintRole: "wooden_plank",
    tintMask: [true, false, true],
    positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
    colors: [0.8, 0.4, 0.2, 0.2, 0.3, 0.4, 0.4, 0.2, 0.1],
    emission: [0, 1, 0],
    indices: [0, 1, 2]
  };
  const build = (seed) =>
    appendDecorationRenderPackage(
      {
        package: { whiteBase: true, nativeAssets, colorOwners: [{ id: "house", seed }], programs: {}, draws: [], textures: {} },
        dynamicFiles: [],
        asset: async () => {
          throw Error("unexpected");
        }
      },
      [part]
    );
  const result = build(42),
    other = build(0xffffffff);
  const vertices = new Float32Array(await result.asset(result.package.draws[0].attributes.find(a => a.location === 0).file));
  assert.deepEqual(vertices, new Float32Array(await other.asset(other.package.draws[0].attributes.find(a => a.location === 0).file)));
  const attributes = result.package.draws[0].attributes;
  const stride = attributes.find(a => a.location === 0).stride / 4;
  const sourceOffset = attributes.find((a) => a.location === 8).offset / 4;
  const roleOffset = attributes.find((a) => a.location === 7).offset / 4;
  for (const i of [0, 2])
    for (let k = 0; k < 3; k++)
      assert.ok(
        Math.abs(vertices[i * stride + 6 + k] * vertices[i * stride + sourceOffset + k] - part.colors[i * 3 + k]) < 1e-6
      );
  assert.deepEqual([...vertices.slice(stride + sourceOffset, stride + sourceOffset + 3)], [1, 1, 1]);
  assert.equal(vertices[stride + roleOffset], -1);
});

test("source palette changes propagate without flattening per-layer colors or rebuilding geometry", () => {
  const a = masonryAppearance({});
  const colors = new Float32Array([0.8, 0.3, 0.1, 1, 0.2, 0.4, 0.6, 1, 0.3, 0.2, 0.1, 1, 0.5, 0.5, 0.2, 1]);
  a.registerSourceReference(0, { brick: 1 });
  a.registerSourceColors("brick_colors", colors);
  let rendered;
  const subscription = a.subscribe(() => {
    rendered = a.textureColors("brick_colors", colors);
  });
  assert.deepEqual(rendered, colors);
  assert.deepEqual(a.tint("brick"), [1, 1, 1, 0]);
  a.setSeed(42);
  const changed = rendered;
  assert.deepEqual(changed, masonrySourcePalette(colors, 42));
  assert.notDeepEqual(changed, colors);
  a.setColor("brick", "#ffffff");
  assert.ok(rendered.every((v) => v === 1));
  a.reset();
  assert.deepEqual(rendered, changed);
  a.setSeed(0);
  assert.deepEqual(rendered, colors);
  const original = [0.4, 0.2, 0.1];
  assert.deepEqual(a.previewColor("brick", 1, original), original);
  a.setSeed(42);
  assert.deepEqual(
    a.previewColor("brick", 1, original),
    original.map((v, i) => (v * changed[4 + i]) / colors[4 + i])
  );
  let late;
  const listener = a.subscribe(() => {
    late = a.textureColors("brick_colors", colors);
  });
  assert.deepEqual(late, changed);
  listener.destroy();
  subscription.destroy();
});

test("palette seed rejects invalid input without changing state, colors or notifying consumers", () => {
  const a = masonryAppearance({});
  a.setSeed(23);
  a.registerSourceReference(0);
  a.setColor("brick", "#804020");
  let notifications = 0;
  const subscription = a.subscribe(() => notifications++);
  for (const seed of [-1, 0.5, 0x100000000, NaN, Infinity, "12", null, undefined]) {
    assert.throws(() => a.setSeed(seed), /Invalid masonry palette seed/);
    assert.equal(a.paletteSeed, 23);
    assert.equal(a.color("brick"), "#804020");
  }
  assert.equal(notifications, 1);
  subscription.destroy();
  const early = masonryAppearance({});
  early.setSeed(23);
  early.registerSourceReference(0);
  a.reset();
  assert.deepEqual(early.tint("brick", 0), a.tint("brick", 0));
  assert.equal(early.color("brick"), a.color("brick"));
  assert.equal(early.color("brick"), "#ffffff", "unloaded source colors are not synthesized");
  const source = new Float32Array([0.5, 0.3, 0.1, 1]);
  early.registerSourceColors("brick_colors", source);
  a.registerSourceColors("brick_colors", source);
  assert.equal(early.color("brick"), a.color("brick"));
  assert.notEqual(early.color("brick"), "#ffffff");
});
