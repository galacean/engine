import {
  AssetType,
  BufferAsset,
  ContentRestorer,
  Engine,
  Material,
  Texture2D,
  TextureFilterMode,
  TextureFormat,
  TextureWrapMode,
  Vector4
} from "@galacean/engine";

const TREE_MECHANICAL_MAGIC = 0x33444d57;
const TREE_MECHANICAL_VERSION = 16;
const TREE_MECHANICAL_HEADER_BYTES = 64;
const TREE_MECHANICAL_TRANSFORM_TEXELS = 4;
const TREE_MECHANICAL_DYNAMICS_TEXELS = 2;
const TREE_MECHANICAL_MAXIMUM_LOD_COUNT = 3;

export type TerrainTreeMechanicalDepth = 0 | 1 | 2 | 3;

/** GPU-owned, immutable, fixed-depth mechanics atlas shared by every instance of one authored tree asset. */
export class TerrainTreeMechanicalGpuData {
  readonly label: string;
  readonly transformTexture: Texture2D;
  readonly dynamicsTexture: Texture2D;
  readonly boundsMinimum: Vector4;
  readonly boundsExtent: Vector4;
  readonly textureSize: Vector4;
  readonly elementCount: number;
  readonly lodElementOffsets: readonly number[];
  /** Maximum authored hierarchy depth in each contiguous LOD segment. */
  readonly lodMechanicalDepths: readonly TerrainTreeMechanicalDepth[];

  private constructor(engine: Engine, source: ArrayBuffer, label: string) {
    this.label = label;
    const view = new DataView(source);
    if (source.byteLength < TREE_MECHANICAL_HEADER_BYTES || view.getUint32(0, true) !== TREE_MECHANICAL_MAGIC) {
      throw new Error(`Tree mechanical data ${label} has an invalid header`);
    }
    const version = view.getUint16(4, true);
    const transformTexels = view.getUint8(6);
    const lodCount = view.getUint8(7);
    if (version !== TREE_MECHANICAL_VERSION || transformTexels !== TREE_MECHANICAL_TRANSFORM_TEXELS) {
      throw new Error(
        `Tree mechanical data ${label} requires v${TREE_MECHANICAL_VERSION}/${TREE_MECHANICAL_TRANSFORM_TEXELS} texels, received v${version}/${transformTexels}`
      );
    }
    if (lodCount === 0 || lodCount > TREE_MECHANICAL_MAXIMUM_LOD_COUNT) {
      throw new Error(`Tree mechanical data ${label} has invalid LOD count ${lodCount}`);
    }
    this.elementCount = view.getUint32(8, true);
    const transformWidth = view.getUint16(12, true);
    const transformHeight = view.getUint16(14, true);
    const dynamicsWidth = view.getUint16(16, true);
    const dynamicsHeight = view.getUint16(18, true);
    const minimum = [view.getFloat32(20, true), view.getFloat32(24, true), view.getFloat32(28, true)] as const;
    const maximum = [view.getFloat32(32, true), view.getFloat32(36, true), view.getFloat32(40, true)] as const;
    this.lodElementOffsets = Array.from({ length: lodCount }, (_, lod) => view.getUint32(44 + lod * 4, true));
    const transformBytes = view.getUint32(56, true);
    const dynamicsBytes = view.getUint32(60, true);
    const expectedTransformBytes = transformWidth * transformHeight * 4 * Uint16Array.BYTES_PER_ELEMENT;
    const expectedDynamicsBytes = dynamicsWidth * dynamicsHeight * 4;
    if (
      transformWidth === 0 ||
      transformHeight === 0 ||
      dynamicsWidth === 0 ||
      dynamicsHeight === 0 ||
      transformBytes !== expectedTransformBytes ||
      dynamicsBytes !== expectedDynamicsBytes ||
      transformBytes < this.elementCount * TREE_MECHANICAL_TRANSFORM_TEXELS * 4 * Uint16Array.BYTES_PER_ELEMENT ||
      dynamicsBytes < this.elementCount * TREE_MECHANICAL_DYNAMICS_TEXELS * 4 ||
      TREE_MECHANICAL_HEADER_BYTES + transformBytes + dynamicsBytes !== source.byteLength
    ) {
      throw new Error(`Tree mechanical data ${label} has an inconsistent atlas layout`);
    }
    if (
      this.elementCount === 0 ||
      this.lodElementOffsets[0] !== 0 ||
      this.lodElementOffsets.some(
        (offset, lod) => offset >= this.elementCount || (lod > 0 && offset <= this.lodElementOffsets[lod - 1])
      )
    ) {
      throw new Error(`Tree mechanical data ${label} has invalid LOD element segments`);
    }

    const transformValues = new Uint16Array(source, TREE_MECHANICAL_HEADER_BYTES, transformBytes / 2);
    const dynamicsValues = new Uint8Array(source, TREE_MECHANICAL_HEADER_BYTES + transformBytes, dynamicsBytes);
    this.lodMechanicalDepths = this.lodElementOffsets.map((start, lod) => {
      const end = this.lodElementOffsets[lod + 1] ?? this.elementCount;
      let maximumDepth: TerrainTreeMechanicalDepth = 0;
      for (let element = start; element < end; element++) {
        const metadata = dynamicsValues[element * TREE_MECHANICAL_DYNAMICS_TEXELS * 4 + 3];
        maximumDepth = Math.max(maximumDepth, metadata & 0x03) as TerrainTreeMechanicalDepth;
      }
      return maximumDepth;
    });
    this.transformTexture = createDataTexture(
      engine,
      transformWidth,
      transformHeight,
      TextureFormat.R16G16B16A16,
      transformValues
    );
    engine.resourceManager.addContentRestorer(
      new TerrainTreeMechanicalTextureContentRestorer(this.transformTexture, transformValues)
    );
    this.dynamicsTexture = createDataTexture(
      engine,
      dynamicsWidth,
      dynamicsHeight,
      TextureFormat.R8G8B8A8,
      dynamicsValues
    );
    engine.resourceManager.addContentRestorer(
      new TerrainTreeMechanicalTextureContentRestorer(this.dynamicsTexture, dynamicsValues)
    );
    this.boundsMinimum = new Vector4(minimum[0], minimum[1], minimum[2], 0);
    this.boundsExtent = new Vector4(
      Math.max(maximum[0] - minimum[0], 1e-5),
      Math.max(maximum[1] - minimum[1], 1e-5),
      Math.max(maximum[2] - minimum[2], 1e-5),
      0
    );
    this.textureSize = new Vector4(transformWidth, transformHeight, dynamicsWidth, dynamicsHeight);
  }

  static async load(engine: Engine, url: string): Promise<TerrainTreeMechanicalGpuData> {
    const asset = await engine.resourceManager.load<BufferAsset>({ type: AssetType.Buffer, url });
    try {
      return new TerrainTreeMechanicalGpuData(engine, asset.buffer.slice(0), url);
    } finally {
      asset.destroy();
    }
  }

  bind(material: Material): void {
    material.shaderData.setTexture("material_WindMechanicalTransforms", this.transformTexture);
    material.shaderData.setTexture("material_WindMechanicalDynamics", this.dynamicsTexture);
    material.shaderData.setVector4("material_WindMechanicalBoundsMin", this.boundsMinimum);
    material.shaderData.setVector4("material_WindMechanicalBoundsExtent", this.boundsExtent);
    material.shaderData.setVector4("material_WindMechanicalTextureSize", this.textureSize);
  }

  destroy(): void {
    this.transformTexture.destroy();
    this.dynamicsTexture.destroy();
  }
}

class TerrainTreeMechanicalTextureContentRestorer extends ContentRestorer<Texture2D> {
  constructor(
    resource: Texture2D,
    private readonly _values: Uint16Array | Uint8Array
  ) {
    super(resource);
  }

  restoreContent(): void {
    this.resource.setPixelBuffer(this._values);
  }
}

function createDataTexture(
  engine: Engine,
  width: number,
  height: number,
  format: TextureFormat,
  values: Uint16Array | Uint8Array
): Texture2D {
  const texture = new Texture2D(engine, width, height, format, false, false);
  texture.filterMode = TextureFilterMode.Point;
  texture.wrapModeU = texture.wrapModeV = TextureWrapMode.Clamp;
  texture.setPixelBuffer(values);
  return texture;
}
