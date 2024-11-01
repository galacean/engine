import { GroupModifyFlags, UIGroup } from "../UIGroup";
import { ICanvasElement } from "./ICanvasElement";

export interface IGroupElement extends ICanvasElement {
  _group: UIGroup;
  _indexInGroup: number;
  _onGroupModify(flag: GroupModifyFlags): void;
}
