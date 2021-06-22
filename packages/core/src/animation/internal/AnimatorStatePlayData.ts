import { Component } from "../../Component";
import { AnimatorState } from "../AnimatorState";
import { StatePlayState } from "../enums/StatePlayState";
import { AnimatorStateData } from "./AnimatorStataData";

/**
 * @internal
 */
export class AnimatorStatePlayData {
  state: AnimatorState;
  stateData: AnimatorStateData;
  frameTime: number;
  playState: StatePlayState;
}
