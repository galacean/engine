import { Engine } from "../Engine";
import { ShapeGeometry } from "./ShapeGeometry";

/**
 * 长方体
 */
export class CuboidGeometry extends ShapeGeometry {
  /**
   * 创建长方体。
   * @param width - 宽
   * @param height - 高
   * @param depth - 深
   * @param engine - 引擎
   */
  constructor(width: number = 1, height: number = 1, depth: number = 1, engine: Engine) {
    super(engine);

    const halfWidth: number = width / 2;
    const halfHeight: number = height / 2;
    const halfDepth: number = depth / 2;

    // prettier-ignore
    const vertices: Float32Array = new Float32Array([
    	// up
    	-halfWidth, halfHeight, -halfDepth, 0, 1, 0, 0, 0, halfWidth, halfHeight, -halfDepth, 0, 1, 0, 1, 0, halfWidth, halfHeight, halfDepth, 0, 1, 0, 1, 1, -halfWidth, halfHeight, halfDepth, 0, 1, 0, 0, 1,
    	// down
    	-halfWidth, -halfHeight, -halfDepth, 0, -1, 0, 0, 1, halfWidth, -halfHeight, -halfDepth, 0, -1, 0, 1, 1, halfWidth, -halfHeight, halfDepth, 0, -1, 0, 1, 0, -halfWidth, -halfHeight, halfDepth, 0, -1, 0, 0, 0,
    	// left
    	-halfWidth, halfHeight, -halfDepth, -1, 0, 0, 0, 0, -halfWidth, halfHeight, halfDepth, -1, 0, 0, 1, 0, -halfWidth, -halfHeight, halfDepth, -1, 0, 0, 1, 1, -halfWidth, -halfHeight, -halfDepth, -1, 0, 0, 0, 1,
    	// right
    	halfWidth, halfHeight, -halfDepth, 1, 0, 0, 1, 0, halfWidth, halfHeight, halfDepth, 1, 0, 0, 0, 0, halfWidth, -halfHeight, halfDepth, 1, 0, 0, 0, 1, halfWidth, -halfHeight, -halfDepth, 1, 0, 0, 1, 1,
    	// fornt
    	-halfWidth, halfHeight, halfDepth, 0, 0, 1, 0, 0, halfWidth, halfHeight, halfDepth, 0, 0, 1, 1, 0, halfWidth, -halfHeight, halfDepth, 0, 0, 1, 1, 1, -halfWidth, -halfHeight, halfDepth, 0, 0, 1, 0, 1,
    	// back
    	-halfWidth, halfHeight, -halfDepth, 0, 0, -1, 1, 0, halfWidth, halfHeight, -halfDepth, 0, 0, -1, 0, 0, halfWidth, -halfHeight, -halfDepth, 0, 0, -1, 0, 1, -halfWidth, -halfHeight, -halfDepth, 0, 0, -1, 1, 1]);

    // prettier-ignore
    const indices: Uint16Array = new Uint16Array([
    	// up
    	0, 2, 1, 2, 0, 3,
    	// donw
    	4, 6, 7, 6, 4, 5,
    	// left
    	8, 10, 9, 10, 8, 11,
    	// right
    	12, 14, 15, 14, 12, 13,
    	// fornt
    	16, 18, 17, 18, 16, 19,
    	// back
    	20, 22, 23, 22, 20, 21]);
    this._initialize(engine, vertices, indices);
  }
}
