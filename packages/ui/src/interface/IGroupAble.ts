import { Entity } from "@galacean/engine";
import { GroupModifyFlags, UIGroup } from "../component/UIGroup";
import { IElement } from "./IElement";

export interface IGroupAble extends IElement {
  _group: UIGroup;
  _indexInGroup: number;
  _groupListeningEntities: Entity[];
  _isGroupDirty: boolean;

  _globalAlpha?: number;
  _globalInteractive?: boolean;

  _getGroup(): UIGroup;
  _onGroupModify(flag: GroupModifyFlags, isPass?: boolean): void;
  _groupListener: (flag: number) => void;
}
