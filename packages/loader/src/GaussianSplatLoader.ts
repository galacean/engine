import {
  AssetPromise,
  AssetType,
  GaussianSplat,
  Loader,
  LoadItem,
  ResourceManager,
  resourceLoader
} from "@galacean/engine-core";

const SH_C0 = 0.28209479177387814;
const PLY_TYPE_SIZE: Record<string, number> = {
  char: 1,
  uchar: 1,
  uint8: 1,
  int8: 1,
  short: 2,
  ushort: 2,
  int16: 2,
  uint16: 2,
  int: 4,
  uint: 4,
  int32: 4,
  uint32: 4,
  float: 4,
  float32: 4,
  double: 8,
  float64: 8
};

@resourceLoader(AssetType.GaussianSplat, ["splat", "ply"])
class GaussianSplatLoader extends Loader<GaussianSplat> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<GaussianSplat> {
    const bufferPromise: Promise<ArrayBuffer> =
      // @ts-ignore
      resourceManager._request(item.url, { ...item, type: "arraybuffer" });
    return AssetPromise.resolve(bufferPromise).then((buffer) => {
      const splatBuffer = GaussianSplatLoader._isPLY(buffer) ? GaussianSplatLoader._convertPLYToSplat(buffer) : buffer;
      const splat = new GaussianSplat(resourceManager.engine);
      splat.setData(splatBuffer);
      return splat;
    });
  }

  private static _isPLY(buffer: ArrayBuffer): boolean {
    const u8 = new Uint8Array(buffer, 0, 3);
    return u8[0] === 0x70 && u8[1] === 0x6c && u8[2] === 0x79; // "ply"
  }

  /**
   * Convert a binary 3DGS `.ply` (Inria training output) into the 32-byte-per-splat layout, applying the
   * stored activations: scale = exp(s), opacity = sigmoid(o), color = 0.5 + C0 * f_dc, quaternion normalized.
   */
  private static _convertPLYToSplat(buffer: ArrayBuffer): ArrayBuffer {
    const headerText = new TextDecoder().decode(new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 1024 * 10)));
    const marker = "end_header\n";
    const headerEnd = headerText.indexOf(marker);
    if (headerEnd < 0) {
      throw new Error("GaussianSplatLoader: invalid PLY, missing end_header.");
    }

    let vertexCount = 0;
    let inVertex = false;
    let stride = 0;
    const offsets: Record<string, number> = {};
    for (const line of headerText.substring(0, headerEnd).split("\n")) {
      if (line.startsWith("element ")) {
        const tokens = line.split(/\s+/);
        inVertex = tokens[1] === "vertex";
        if (inVertex) {
          vertexCount = parseInt(tokens[2]);
        }
      } else if (inVertex && line.startsWith("property ")) {
        const [, type, name] = line.split(/\s+/);
        offsets[name] = stride;
        stride += PLY_TYPE_SIZE[type] ?? 0;
      }
    }

    const view = new DataView(buffer, headerEnd + marker.length);
    const out = new ArrayBuffer(vertexCount * 32);
    const f32 = new Float32Array(out);
    const u8 = new Uint8ClampedArray(out);
    const get = (row: number, name: string): number => view.getFloat32(row * stride + offsets[name], true);

    for (let i = 0; i < vertexCount; i++) {
      const fo = i * 8;
      const uo = i * 32;
      f32[fo + 0] = get(i, "x");
      f32[fo + 1] = get(i, "y");
      f32[fo + 2] = get(i, "z");
      f32[fo + 3] = Math.exp(get(i, "scale_0"));
      f32[fo + 4] = Math.exp(get(i, "scale_1"));
      f32[fo + 5] = Math.exp(get(i, "scale_2"));

      u8[uo + 24] = (0.5 + SH_C0 * get(i, "f_dc_0")) * 255;
      u8[uo + 25] = (0.5 + SH_C0 * get(i, "f_dc_1")) * 255;
      u8[uo + 26] = (0.5 + SH_C0 * get(i, "f_dc_2")) * 255;
      u8[uo + 27] = (1 / (1 + Math.exp(-get(i, "opacity")))) * 255;

      const r0 = get(i, "rot_0");
      const r1 = get(i, "rot_1");
      const r2 = get(i, "rot_2");
      const r3 = get(i, "rot_3");
      const len = Math.hypot(r0, r1, r2, r3) || 1;
      u8[uo + 28] = (r0 / len) * 128 + 128;
      u8[uo + 29] = (r1 / len) * 128 + 128;
      u8[uo + 30] = (r2 / len) * 128 + 128;
      u8[uo + 31] = (r3 / len) * 128 + 128;
    }

    return out;
  }
}
