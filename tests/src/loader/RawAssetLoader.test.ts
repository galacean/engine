import { AssetType, BufferAsset, JSONAsset, TextAsset } from "@galacean/engine";
import "@galacean/engine-loader";
import { WebGLEngine } from "@galacean/engine";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let engine: WebGLEngine;

beforeAll(async function () {
  engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
});

afterAll(() => {
  engine.destroy();
});

describe("TextLoader", () => {
  const textContent = "Hello Galacean";
  let textUrl: string;

  beforeAll(() => {
    const blob = new Blob([textContent], { type: "text/plain" });
    textUrl = URL.createObjectURL(blob) + "#.txt";
  });

  it("load returns TextAsset", async () => {
    const asset = await engine.resourceManager.load<TextAsset>({ url: textUrl, type: AssetType.Text });
    expect(asset).to.be.instanceOf(TextAsset);
    expect(asset.text).to.equal(textContent);
  });

  it("cache works", async () => {
    const asset1 = await engine.resourceManager.load<TextAsset>({ url: textUrl, type: AssetType.Text });
    const asset2 = await engine.resourceManager.load<TextAsset>({ url: textUrl, type: AssetType.Text });
    expect(asset1).to.equal(asset2);
  });

  it("destroy clears text", async () => {
    const asset = await engine.resourceManager.load<TextAsset>({
      url: URL.createObjectURL(new Blob(["destroy test"], { type: "text/plain" })) + "#.txt",
      type: AssetType.Text
    });
    expect(asset.text).to.equal("destroy test");
    asset.destroy();
    expect(asset.text).to.be.null;
  });
});

describe("JSONLoader", () => {
  const jsonData = { name: "Galacean", version: 2 };
  let jsonUrl: string;

  beforeAll(() => {
    const blob = new Blob([JSON.stringify(jsonData)], { type: "application/json" });
    jsonUrl = URL.createObjectURL(blob) + "#.json";
  });

  it("load returns JSONAsset", async () => {
    const asset = await engine.resourceManager.load<JSONAsset>({ url: jsonUrl, type: AssetType.JSON });
    expect(asset).to.be.instanceOf(JSONAsset);
    expect(asset.data).to.deep.equal(jsonData);
  });

  it("cache works", async () => {
    const asset1 = await engine.resourceManager.load<JSONAsset>({ url: jsonUrl, type: AssetType.JSON });
    const asset2 = await engine.resourceManager.load<JSONAsset>({ url: jsonUrl, type: AssetType.JSON });
    expect(asset1).to.equal(asset2);
  });

  it("destroy clears data", async () => {
    const asset = await engine.resourceManager.load<JSONAsset>({
      url: URL.createObjectURL(new Blob(["{}"], { type: "application/json" })) + "#.json",
      type: AssetType.JSON
    });
    asset.destroy();
    expect(asset.data).to.be.null;
  });
});

describe("BufferLoader", () => {
  let bufferUrl: string;
  const testData = new Uint8Array([1, 2, 3, 4, 5]);

  beforeAll(() => {
    const blob = new Blob([testData], { type: "application/octet-stream" });
    bufferUrl = URL.createObjectURL(blob) + "#.bin";
  });

  it("load returns BufferAsset", async () => {
    const asset = await engine.resourceManager.load<BufferAsset>({ url: bufferUrl, type: AssetType.Buffer });
    expect(asset).to.be.instanceOf(BufferAsset);
    expect(new Uint8Array(asset.buffer)).to.deep.equal(testData);
  });

  it("load base64", async () => {
    const base64Url = "data:application/octet-stream;base64,AQIDBAU=";
    const asset = await engine.resourceManager.load<BufferAsset>({ url: base64Url, type: AssetType.Buffer });
    expect(asset).to.be.instanceOf(BufferAsset);
    expect(new Uint8Array(asset.buffer)).to.deep.equal(testData);
  });

  it("cache works", async () => {
    const asset1 = await engine.resourceManager.load<BufferAsset>({ url: bufferUrl, type: AssetType.Buffer });
    const asset2 = await engine.resourceManager.load<BufferAsset>({ url: bufferUrl, type: AssetType.Buffer });
    expect(asset1).to.equal(asset2);
  });

  it("destroy clears buffer", async () => {
    const asset = await engine.resourceManager.load<BufferAsset>({
      url: URL.createObjectURL(new Blob([new Uint8Array([0])], { type: "application/octet-stream" })) + "#.bin",
      type: AssetType.Buffer
    });
    asset.destroy();
    expect(asset.buffer).to.be.null;
  });
});
