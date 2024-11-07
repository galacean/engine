import { GroupModifyFlags, UIGroup } from "../component/UIGroup";
import { IUIElement } from "./IUIElement";

export interface IUIGroupable extends IUIElement {
  _group: UIGroup;
  _indexInGroup: number;

  _onGroupModify(flag: GroupModifyFlags): void;
}
