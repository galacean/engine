import { Position } from "./Position";

export interface Statement {
  content: string;
  range: { start: Position; end: Position };
}
