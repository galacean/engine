import { Position } from "./Position";

export interface statement {
  content: string;
  range: { start: Position; end: Position };
}
