import { UpdateFlag } from "../../UpdateFlag";

export class CallBackUpdateFlag extends UpdateFlag {
  public callBack: Function;
  /**
   * @inheritdoc
   */
  dispatch(param?: Object): void {
    this.callBack(param);
  }
}
