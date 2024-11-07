import { OverflowMode } from "../enums/TextOverflow";
import { SubFont } from "./SubFont";

export interface ITextRenderer {
  text: string;
  overflowMode: OverflowMode;
  _getSubFont(): SubFont;
}
