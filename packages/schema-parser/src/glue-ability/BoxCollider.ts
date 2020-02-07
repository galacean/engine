import { Node, ABoxCollider } from "@alipay/o3";

export class BoxCollider extends ABoxCollider {
  private _center: number[] = [0, 0, 0];
  private _size: number[] = [1, 1, 1];
  private isShowCollider: boolean = true;

  constructor(node: Node, props?: any) {
    super(node, props);

    const { center, size, isShowCollider } = props;

    this.center = center;
    this.size = size;
    this.isShowCollider = isShowCollider;
  }

  get center() {
    return this._center;
  }

  set center(value: number[]) {
    this._center = value;
    this.setBoxCenterSize(this._center, this._size);
  }

  get size() {
    return this._size;
  }

  set size(value: number[]) {
    this._size = value;
    this.setBoxCenterSize(this._center, this._size);
  }
}
