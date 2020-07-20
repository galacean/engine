import "../src/BufferLoader";
import { Engine, LoaderType } from "@alipay/o3-core";

describe("text loader test", () => {
  // const engine = new Engine(new WebCanvas);
  // it("test loader test", () => {
  //   const promise = engine.resourceManager
  //     .load<ArrayBuffer>("https://gw.alipayobjects.com/os/bmw-prod/ebe92dc1-3074-42d6-90c8-6255552c3c6e.bin")
  //     .then((res) => {
  //       return new Float32Array(res);
  //     });
  //   return expect(promise).resolves.toEqual(Float32Array.from([1, 2, 3]));
  // });
  // it("test base64 loader", () => {
  //   const promise = engine.resourceManager
  //     .load<ArrayBuffer>({
  //       url: "data:application/octet-stream;base64,AAABAAIAAAAAAAAAAAAAAAAAAAAAAIA/AAAAAAAAAAAAAAAAAACAPwAAAAA=",
  //       type: LoaderType.Buffer
  //     })
  //     .then((res) => {
  //       return new Float32Array(res);
  //     });
  //   return expect(promise).resolves.toEqual(
  //     Float32Array.from([9.183549615799121e-41, 2.802596928649634e-45, 0, 0, 0, 1, 0, 0, 0, 1, 0])
  //   );
  // });
});
