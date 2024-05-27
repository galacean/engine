import LocRange from "../common/LocRange";
import { MacroExpand } from "./MacroExpand";
import PpToken from "./PpToken";

export class MacroInclude extends MacroExpand {
  readonly includeKey: PpToken;

  constructor(includeKey: PpToken, loc: LocRange) {
    super(loc);
    this.includeKey = includeKey;
  }

  expand(): string {
    return "Not implemented.";
  }
}
