import { OverflowMode } from "../enums/TextOverflow";
import { SubFont } from "./SubFont";

/**
 * @internal
 */
export interface ITextRenderer {
  text: string;
  overflowMode: OverflowMode;
  lineSpacing: number;
  _getSubFont(): SubFont;
}
