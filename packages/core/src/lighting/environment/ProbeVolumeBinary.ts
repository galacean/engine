import { Matrix, SphericalHarmonics3, Vector3 } from "@galacean/engine-math";
import { ProbeBrickData, ProbeBrickProbeCount, ProbeVolume, ProbeVolumeCellData } from "./ProbeVolume";

const Magic = 0x4c4f5650;
const Version = 4;
const HeaderSize = 96;
const CellHeaderSize = 16;
const BrickHeaderSize = 16;
const ProbeSize = 34;

/** Compact streamable encoding for L1 diffuse probe lighting. */
export class ProbeVolumeBinary {
  /** Encode all cells owned by a probe volume. */
  static encode(volume: ProbeVolume): ArrayBuffer {
    let byteLength = HeaderSize;
    for (const cell of volume.cells) {
      byteLength += CellHeaderSize + cell.bricks.length * (BrickHeaderSize + ProbeBrickProbeCount * ProbeSize);
    }
    const buffer = new ArrayBuffer(byteLength);
    const view = new DataView(buffer);
    let offset = 0;
    view.setUint32(offset, Magic, true);
    offset += 4;
    view.setUint16(offset, Version, true);
    offset += 2;
    view.setUint16(offset, 0, true);
    offset += 2;
    view.setFloat32(offset, volume.minBrickSize, true);
    offset += 4;
    view.setFloat32(offset, volume.cellSize, true);
    offset += 4;
    view.setFloat32(offset, volume.normalBias, true);
    offset += 4;
    view.setFloat32(offset, volume.viewBias, true);
    offset += 4;
    const elements = volume.localToWorldMatrix.elements;
    for (let i = 0; i < 16; i++, offset += 4) {
      view.setFloat32(offset, elements[i], true);
    }
    view.setUint32(offset, volume.cells.length, true);
    offset += 4;
    view.setUint32(offset, 0, true);
    offset += 4;

    for (const cell of volume.cells) {
      view.setInt32(offset, cell.coordinate.x, true);
      view.setInt32(offset + 4, cell.coordinate.y, true);
      view.setInt32(offset + 8, cell.coordinate.z, true);
      view.setUint32(offset + 12, cell.bricks.length, true);
      offset += CellHeaderSize;
      for (const brick of cell.bricks) {
        view.setFloat32(offset, brick.position.x, true);
        view.setFloat32(offset + 4, brick.position.y, true);
        view.setFloat32(offset + 8, brick.position.z, true);
        view.setUint8(offset + 12, brick.subdivisionLevel);
        offset += BrickHeaderSize;
        for (let probeIndex = 0; probeIndex < ProbeBrickProbeCount; probeIndex++) {
          const coefficients = brick.sphericalHarmonics[probeIndex].coefficients;
          for (let coefficient = 0; coefficient < 12; coefficient++, offset += 2) {
            view.setUint16(offset, floatToHalf(coefficients[coefficient]), true);
          }
          const skyOffset = probeIndex * 4;
          for (let coefficient = 0; coefficient < 4; coefficient++, offset += 2) {
            const value = brick.skyOcclusionSH?.[skyOffset + coefficient] ?? 0;
            view.setUint16(offset, floatToHalf(value), true);
          }
          view.setUint16(offset, floatToHalf(brick.validity?.[probeIndex] ?? 1), true);
          offset += 2;
        }
      }
    }
    return buffer;
  }

  /** Decode a probe artifact. Only nearby cells are uploaded after an anchor is assigned. */
  static decode(buffer: ArrayBuffer): ProbeVolume {
    const view = new DataView(buffer);
    if (view.byteLength < HeaderSize || view.getUint32(0, true) !== Magic) {
      throw new Error("Invalid probe volume binary header.");
    }
    const version = view.getUint16(4, true);
    if (version !== Version) {
      throw new Error(`Unsupported probe volume binary version ${version}.`);
    }
    const minBrickSize = view.getFloat32(8, true);
    const cellSize = view.getFloat32(12, true);
    const normalBias = view.getFloat32(16, true);
    const viewBias = view.getFloat32(20, true);
    const matrixValues = new Array<number>(16);
    let offset = 24;
    for (let i = 0; i < 16; i++, offset += 4) {
      matrixValues[i] = view.getFloat32(offset, true);
    }
    const cellCount = view.getUint32(offset, true);
    offset += 8;
    const cells: ProbeVolumeCellData[] = [];
    for (let cellIndex = 0; cellIndex < cellCount; cellIndex++) {
      ensureAvailable(view, offset, CellHeaderSize);
      const coordinate = new Vector3(
        view.getInt32(offset, true),
        view.getInt32(offset + 4, true),
        view.getInt32(offset + 8, true)
      );
      const brickCount = view.getUint32(offset + 12, true);
      offset += CellHeaderSize;
      const bricks: ProbeBrickData[] = [];
      for (let brickIndex = 0; brickIndex < brickCount; brickIndex++) {
        ensureAvailable(view, offset, BrickHeaderSize + ProbeBrickProbeCount * ProbeSize);
        const position = new Vector3(
          view.getFloat32(offset, true),
          view.getFloat32(offset + 4, true),
          view.getFloat32(offset + 8, true)
        );
        const subdivisionLevel = view.getUint8(offset + 12);
        offset += BrickHeaderSize;
        const sphericalHarmonics: SphericalHarmonics3[] = [];
        const skyOcclusionSH = new Float32Array(ProbeBrickProbeCount * 4);
        const validity = new Float32Array(ProbeBrickProbeCount);
        for (let probeIndex = 0; probeIndex < ProbeBrickProbeCount; probeIndex++) {
          const sh = new SphericalHarmonics3();
          for (let coefficient = 0; coefficient < 12; coefficient++, offset += 2) {
            sh.coefficients[coefficient] = halfToFloat(view.getUint16(offset, true));
          }
          sphericalHarmonics.push(sh);
          const skyOffset = probeIndex * 4;
          for (let coefficient = 0; coefficient < 4; coefficient++, offset += 2) {
            skyOcclusionSH[skyOffset + coefficient] = halfToFloat(view.getUint16(offset, true));
          }
          validity[probeIndex] = halfToFloat(view.getUint16(offset, true));
          offset += 2;
        }
        bricks.push({
          position,
          subdivisionLevel,
          sphericalHarmonics,
          validity,
          skyOcclusionSH
        });
      }
      cells.push({ coordinate, bricks });
    }
    const volume = new ProbeVolume(minBrickSize, [], new Matrix().copyFromArray(matrixValues));
    volume.setCells(cells, cellSize);
    volume.normalBias = normalBias;
    volume.viewBias = viewBias;
    return volume;
  }
}

function ensureAvailable(view: DataView, offset: number, byteLength: number): void {
  if (offset + byteLength > view.byteLength) {
    throw new Error("Probe volume binary data is truncated.");
  }
}

const floatValue = new Float32Array(1);
const floatBits = new Int32Array(floatValue.buffer);
function floatToHalf(value: number): number {
  floatValue[0] = value;
  const x = floatBits[0];
  let bits = (x >> 16) & 0x8000;
  let mantissa = (x >> 12) & 0x07ff;
  const exponent = (x >> 23) & 0xff;
  if (exponent < 103) return bits;
  if (exponent > 142) {
    bits |= 0x7c00;
    if (exponent !== 255 && (x & 0x007fffff) !== 0) {
      bits |= 1;
    }
    return bits;
  }
  if (exponent < 113) {
    mantissa |= 0x0800;
    return bits | ((mantissa >> (114 - exponent)) + ((mantissa >> (113 - exponent)) & 1));
  }
  bits |= ((exponent - 112) << 10) | (mantissa >> 1);
  return bits + (mantissa & 1);
}

function halfToFloat(value: number): number {
  const sign = (value & 0x8000) << 16;
  let exponent = (value >> 10) & 0x1f;
  let mantissa = value & 0x03ff;
  if (exponent === 0) {
    if (mantissa === 0) {
      floatBits[0] = sign;
      return floatValue[0];
    }
    while ((mantissa & 0x0400) === 0) {
      mantissa <<= 1;
      exponent--;
    }
    exponent++;
    mantissa &= ~0x0400;
  } else if (exponent === 31) {
    floatBits[0] = sign | 0x7f800000 | (mantissa << 13);
    return floatValue[0];
  }
  exponent += 112;
  floatBits[0] = sign | (exponent << 23) | (mantissa << 13);
  return floatValue[0];
}
