export enum AnimatorConditionMode {
  IF,
  IFNOT,
  GREATER,
  LESS,
  EQUALS,
  NOTEQUALS
}

export class AnimatorCondition {
  mode: AnimatorConditionMode;
  threshold: any;
  parameter: string;
}
