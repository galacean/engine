import { Entity } from "@galacean/engine";
import { GroupModifyFlags, UIGroup } from "../component/UIGroup";
import { IElement } from "./IElement";

export interface IGroupAble extends IElement {
  _group: UIGroup;
  _indexInGroup: number;
  _groupListeningEntities: Entity[];
  _isGroupDirty: boolean;
  _groupDirtyFlags: number;
  _onUIUpdateIndex?: number;
  _globalAlpha?: number;
  _globalInteractive?: boolean;

  _onUpdate?(): void;
  _onGroupModify(flag: GroupModifyFlags): void;
  _groupListener: (flag: number) => void;
}
