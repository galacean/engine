import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { KTX2Loader } from "@galacean/engine-loader";
import { Texture2D, TextureFormat, GLCapabilityType } from "@galacean/engine-core";
import { describe, beforeAll, afterAll, expect, it } from "vitest";

let engine: WebGLEngine;

const ktx2Buffer =
  "data:application/octet-stream;base64,q0tUWCAyMLsNChoKAAAAAAEAAAAgAAAAIAAAAAAAAAAAAAAAAQAAAAYAAAACAAAA4AAAACwAAAAMAQAAJAAAAAAAAAAAAAAAAAAAAAAAAADOAgAAAAAAAAoEAAAAAAAAAAQAAAAAAADEAQAAAAAAAAoBAAAAAAAAAAEAAAAAAAB7AQAAAAAAAEkAAAAAAAAAQAAAAAAAAABiAQAAAAAAABkAAAAAAAAAEAAAAAAAAABJAQAAAAAAABkAAAAAAAAAEAAAAAAAAAAwAQAAAAAAABkAAAAAAAAAEAAAAAAAAAAsAAAAAAAAAAIAKACmAQIAAwMAAAAAAAAAAAAAAAB/AAAAAAAAAAAA/////x8AAABLVFh3cml0ZXIAQmFzaXMgVW5pdmVyc2FsIDEuMTYAACi1L/0gEIEAADcXFPK/0LcCAAAAAAAAAAAotS/9IBCBAADTgece/CPse/vu9avV1FQAKLUv/SAQgQAA25MOG3hb/VUBRCCf1ZrVjCi1L/0gQAECABOxjmroIK3v688nBYFwQgDTFEBftnC+rcvmtwCKvzYAW7IOhu6HX/JBlZWviYhVSVsUwRtz05/ujjVRdvs/uzcotS/9YAAAAQgAW4EGnlPvvLGqIfBXM1ZiRRMztUZ07PE+q7btFqqucgCTsPb4TgrS48m231cAGxUA4ZriYeM3PLMrNhMqIpK/AtuRBkGe59zvXpgYqFisbL4TJzAiefCxPq21vuJyy0sAWyXgRlLu5ZxIVISvVolyRFMkAXbiPORxye91Y9PLTQBbNm0MqQd9W4mZyJqSPZJ2E0vtiEdyzeOlx/G0q38VANujrj6ffObuTwQlUZNVrZoTmA0gmxt9L4/3/dZLSWAA27ViaseXvVm927lqrGliUluj5hzzB74KJ5Z13/nJ6dgTkQZKj9l7a/t8rzeqLE8AE6UN0uw9b9/r7/1iYMofACi1L/1gAAMBIADbgQZeseu9sSZmQLaY+t3+0wGhssVuo23btm3n1EhIANOR77YJDapt+/ftlEsNXACbE2AjeeN9+WEXnlTt/o2ZkxGvbbeSqW27tm0Vinx/AJOA5lympK1r+67rqkiLXADTk+Oqz2yp696u6yZN8TIAMbXiKZAGqIBIT8Um1gK0G5uBk4Jfa64zBoRAhFXZ6v+7gZa+VmudNVJ2Ybam+/vvoaveNiQ/btIyEiMRA4Nx33Flc6XDOqICFBARlKjMto+TyN22AkaFw+G5HAFbqH8Ak9LeHNm1SlPhrutW5KsNAJNS36Qw0KYqiq7rBjqNUQDhFqjusi6swiD5EkBAEgIg24GCEX7znfONgtmT2ten2hORF16wVKFt17bvPwykZgATajDOJg+0rK44HFzl8VsA8bQSyi6wEehL/rCIGCGft9ujb0IU2uyYVRaaVU/p8OmTQt82m4PL06GsN5cnyXcAU1lrkVnbl9FQh4UdqSUnAGGmn0BKkAiJst043E/on+bbkUaakmfM7RYRIoVmlpx3E6Mxem+rvu3Xz/VUmpodABPGnofB65zT5fo0+Pj0cgAxYwcw0C9wBohtZPukDKSOk0zdbLMXwuHUsDIAbyUmALFNCyGoT5AF/gNyNEAwMhQTwmMLxcx0voist8pk4WwAE1gNspBFJZ5rjtN4bGxsAJPIbr6vx/owCIIw4JZdDQAh5FbSvKhVoCUE3/vvbl1wcWynAA2oB9kSsnlgMzG7/5NZz0PL32L5uLAikkh9VwChpG8RPaASwC3V/u+3SQhikzLRHLN19+PB5RX7jwB9ABNpcL7ZVtDR0Lg00vHlYAATywQWpB89HEfPc2hs7m4A4XVHICE3JAaA2RW0MY+iOeEVMEEOpAVoIfi1/nzLqJmT4POM9GVs680kSUMnr0cAcay3MTATrQIAAABwM/ZWvSElQODROugFxCLPNWOuIDGx7L4ogCsvFho0l+rriiYDYVTXSU68CRgP1nHs+728/hOon7eB6bzrPpblctF4WAATmA0GxGJovo7lpd1OvQ4A4aTnKdA37iZMhGb81C/0BROGBfAeHGAvjeUng1VfXQATsgOkYq5oeWVXhtVMbmMA8UAr7em+tIzteeTN1JigybHIgyZL0isvX0CFtmYwhPgThT/4xCpz6d5tbe2RhTgAMco552EjM0H/JNky2TK6QJPK00ICMH8uS0bDt6B9IACTWeU86FElngpORV/Zil8AIRQIwDysErDRzPTdxu+xfpM6P6IwZzcsjvq0uBzLWQCxwW+mW9KqHjtnRnh/A0ll4ah3osEv+CQnIyI0AxEy6nHjrrUQG2+yRgIjkZS8v0ihrOoQipzJWorP8zv7Bt6O";
let blob: Blob;
let texture2dKtx2Url: string;
let originSetPixelBuffer = Texture2D.prototype.setPixelBuffer;

const astcResult =
  "data:application/octet-stream;base64,QgT3K7eLaAV/u18ZbQJmhEJIBrCsvey1672rBQmJKqdCyAmwb7U77Smv6AsdWKnWQgTvopfX/JOZsX+3KnnoBkLIHrAstWizqr1pFYCfKNdCyAlwbL15td11LBOdaAlqQsgJsJh9PL2cfaoLpkeZpEICpQMhA9ACJ9K/lJtcDd1CBCuqmfp5RP9Xm6ohAiGAQgTrq7W5SlT3399lbYZuCkICycM435pJBHE+P3c7t3NCArE6CF2ASg6SzOrWd/e3QigCkNn4AsaarCYb/wol/0IoAlCcooS+XnXqC9iqJ6pCKAJQqbhHtVptKgs6Z1ygQgItL7CX2Er7v7f9/bdg+0IEbzPX6ekTW+XrW8mbQaFCiAKwrL1vu2unOQ1M7edDQqgDkOi6VNcJJMELEjisxUICbYqwo4A+7fmEGBENf6JCBNtDvQkWjmjwaA1Vppd1QigC0BrqAmqJr2Ye94kbVkKIO5CNcoTdDLQFHnLSSixCAqWTEBGICGf5F/I7HLuNQgRnMpnoSwsRxpaZXrt3d0KoA7Bqr63zmb63Cxxc3NZC6CyQ2vLQ1qrkxR6bq7MzQgJ1AkDXgBmO2s/aINlJ3kIoAtAMdBGVjLoBDjKSCf9CAmsDwCcAFtez8/3TsT8QQog70B/6gHwIv9EOZLxsdkKIA9CNbjOdmWRVA+vr6+tCaA0QPNBHFCOQBQ6nIkv5QgLNLymrAloOunb33/sgREIC0QMpD4gN/92MzAaeTYhCyFZwS28gm8qqAhR1oAl2QgLRDyBlAFxGEJLt93+rZEIoAvCc5AF0TrfTHF8A8Z9CCAnQDXqE3QykgR5DI3J0QogDkEpsYNObdvcZS8vr40ICSRMRG4AYY7oOc9JXZP5CAmUDpEuAFpkV0z5/rR8EQugEcByvpT4OOW8RTgobfUICzQM0yYAKQpWQM/H///9CAjUfIR2AF3P7ijlTDLu8QgLhAj2Vwhg/m64oqBbTV0IC5ZI8k4Axfz293zeOa+BC6Cyw2X05g2u85hsNj0WHQogD0Nj6gH/Mt2MOSK5JyUIC9QM5G8QbX9AL1MCZ3p1CiAPwHKREbkn3IAStjSVwQogDcEq/1d7q2kQOYzuZKUICux5SH/FSbPrm1EzYYZhCArOTUtf5Eh8hDGZtoQLqQqgDcM9l+3UabesFsd/LNUIC2R9NUahE/aKzZLNk2xBCKALQ2bQhhU16xwf9YAWtQsgJ0A96RYWYqkUF/aiNRUICzQ4sJQAbfo33Y7svMwtCqAOQSbhH1+j80x4ylmPjQgK7FtPV9RGmksD+HmLmrEIC8Rthl6QTqLN3P9O7OztCAkWKvU2WSe0CwtZ2O789QgIhIxxTlkVxe2Df3M/zoQ==";

async function encode(array: ArrayBuffer): Promise<string> {
  return new Promise((resolve) => {
    const blob = new Blob([array]);
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target.result as string;
      resolve(dataUrl);
    };
    reader.readAsDataURL(blob);
  });
}

beforeAll(async function () {
  Texture2D.prototype.setPixelBuffer = function (data, mipLevel) {
    if (!this.mipmapData) this.mipmapData = [];
    this.mipmapData[mipLevel] = data;
  };
  const canvasDOM = document.createElement("canvas");
  canvasDOM.width = 1024;
  canvasDOM.height = 1024;
  engine = await WebGLEngine.create({ canvas: canvasDOM });
  blob = await fetch(ktx2Buffer).then((res) => res.blob());
  texture2dKtx2Url = URL.createObjectURL(blob) + "#.ktx2";
});
describe("ktx2 Loader test", function () {
  it("init and destroy test", async () => {
    // @ts-ignore
    const transcoder = KTX2Loader._khronosTranscoder ?? KTX2Loader._binomialLLCTranscoder;
    expect(transcoder).not.to.be.null;
    KTX2Loader.release();
    // @ts-ignore
    expect(KTX2Loader._khronosTranscoder).to.be.null;
    // @ts-ignore
    expect(KTX2Loader._binomialLLCTranscoder).to.be.null;
  });

  it("loader", async () => {
    const texture2d = await engine.resourceManager.load<Texture2D>(texture2dKtx2Url);
    expect(texture2d.width).to.be.equal(32);
    expect(texture2d.height).to.be.equal(32);
    expect(texture2d.mipmapCount).to.be.equal(6);
    texture2d.destroy(true);
  });

  it("astc transcoder", async () => {
    // @ts-ignore
    engine._hardwareRenderer.canIUse = (cap: GLCapabilityType) => {
      return cap === GLCapabilityType.astc;
    };
    const texture2d = await engine.resourceManager.load<Texture2D>(texture2dKtx2Url);
    expect(texture2d.width).to.be.equal(32);
    expect(texture2d.height).to.be.equal(32);
    expect(texture2d.mipmapCount).to.be.equal(6);
    expect(texture2d.format).to.be.equal(TextureFormat.ASTC_4x4);
    // @ts-ignore
    const base64 = await encode(texture2d.mipmapData[0]);
    expect(base64).to.be.equal(astcResult);
    texture2d.destroy();
  });

  it("pvrtc transcoder", async () => {
    // @ts-ignore
    engine._hardwareRenderer.canIUse = (cap: GLCapabilityType) => {
      return cap === GLCapabilityType.pvrtc;
    };
    const texture2d = await engine.resourceManager.load<Texture2D>(texture2dKtx2Url);
    expect(texture2d.width).to.be.equal(32);
    expect(texture2d.height).to.be.equal(32);
    expect(texture2d.mipmapCount).to.be.equal(6);

    // pbrtc don't support sRGB, should downgrade to R8G8B8A8
    expect(texture2d.format).to.be.equal(TextureFormat.R8G8B8A8);
    texture2d.destroy();
  });

  it("dxt transcoder", async () => {
    // @ts-ignore
    engine._hardwareRenderer.canIUse = (cap: GLCapabilityType) => {
      return cap === GLCapabilityType.s3tc_srgb;
    };
    const texture2d = await engine.resourceManager.load<Texture2D>(texture2dKtx2Url);
    expect(texture2d.width).to.be.equal(32);
    expect(texture2d.height).to.be.equal(32);
    expect(texture2d.mipmapCount).to.be.equal(6);
    expect(texture2d.format).to.be.equal(TextureFormat.BC1);
    texture2d.destroy();
  });
});

afterAll(() => {
  Texture2D.prototype.setPixelBuffer = originSetPixelBuffer;
});
