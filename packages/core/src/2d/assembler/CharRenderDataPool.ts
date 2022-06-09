import { Color, Vector2, Vector3 } from "@oasis-engine/math";
import { Texture2D } from "../../texture";
import { RenderData2D } from "../data/RenderData2D";
import { CharRenderData } from "./CharRenderData";

export class CharRenderDataPool {
  private _pools: Array<CharRenderData> = [];
  private _poolIndex: number = -1;

  /**
   * @internal
   */
  constructor() {
    const length = 50;
    for (let i = 0; i < length; ++i) {
      this._pools[i] = this._createData();
    }
    this._poolIndex = length - 1;
  }

  getData(): CharRenderData {
    if (this._poolIndex !== -1) {
      this._poolIndex--;
      return this._pools.pop();
    }

    return this._createData();
  }

  putData(data: CharRenderData): void {
    this._pools.push(data);
    this._poolIndex++;
  }

  private _createData(): CharRenderData {
    const positions: Array<Vector3> = [];
    const uvs: Array<Vector2> = [];
    const triangles: Array<number> = [];
    const color: Color = null;
    const texture: Texture2D = null;
    const localPositions: Array<Vector3> = [];

    positions[0] = new Vector3();
    positions[1] = new Vector3();
    positions[2] = new Vector3();
    positions[3] = new Vector3();
    localPositions[0] = new Vector3();
    localPositions[1] = new Vector3();
    localPositions[2] = new Vector3();
    localPositions[3] = new Vector3();

    uvs[0] = new Vector2();
    uvs[1] = new Vector2();
    uvs[2] = new Vector2();
    uvs[3] = new Vector2();

    triangles[0] = 0, triangles[1] = 2, triangles[2] = 1;
    triangles[3] = 2, triangles[4] = 0, triangles[5] = 3;

    const renderData: RenderData2D = { positions, uvs, triangles, color };

    return { texture, renderData, localPositions };
  }
}
