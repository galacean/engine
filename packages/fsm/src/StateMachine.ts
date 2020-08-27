const noop = function () {};

/**
 * 状态机类
 * @class
 * @private
 */
class StateMachine {
  public name;
  public currentState;
  public machineTime;
  public states;
  public transitions;

  /**
   * @constructor
   * @param {string} name 名称
   */
  constructor(name) {
    this.name = name;
    this.currentState = {
      name: "init",
      onEnter: noop,
      onExit: noop,
      onTick: noop
    };

    this.machineTime = 0;
    this.states = {};
    this.transitions = {};
  }

  /**
   * 添加一个状态
   * @param {string}  name 状态名
   * @param {function} onEnter 进入状态函数
   */
  addState(name, onEnter = noop) {
    let state = {
      name: "",
      onEnter: noop,
      onExit: noop,
      onTick: noop,
      _startTime: 0
    };
    // shortCut
    if (typeof name === "string") {
      state.name = name;
      state.onEnter = onEnter;
    } else {
      // full config
      state = name;
    }

    this.states[state.name] = state;
  }

  /**
   * 添加一个状态过渡
   * @param {{ from: string | string[], to: string, trigger: string }} param0
   */
  addTransition({ from, to, trigger }) {
    let currentStates = from;

    if (typeof currentStates === "string") {
      currentStates = [from];
    }

    // TODO: add state verify
    for (const currentState of currentStates) {
      this.transitions[[trigger, currentState] as any] = to;
    }
  }

  /**
   * 添加多个状态过渡
   * @param {Array}  transitions 状态过渡数组
   */
  addTransitions(transitions) {
    for (const transition of transitions) {
      this.addTransition(transition);
    }
  }

  /**
   * 判断当前状态是否为state
   * @param {Object}  state 状态名
   */
  is(state) {
    return this.currentState.name === state;
  }

  /**
   * 从当前状态进入给定状态
   * @param {string}  stateName 状态名
   * @param {Object} data 数据
   */
  to(stateName, data = {}) {
    const prevState = this.currentState || {};
    const toState = this.states[stateName];
    // exit current state

    if (prevState.onExit) {
      prevState.startTime = 0;
      prevState.onExit.call(this, stateName, data);
    }

    this.currentState = toState;

    // enter next state
    if (toState && toState.onEnter) {
      toState.startTime = this.machineTime;
      toState.onEnter.call(this, prevState.name, data);
    }
  }

  /**
   * 从当前状态进入给定状态
   * @param {string}  trigger 触发器
   * @param {Object} data 数据
   */
  dispatch(trigger, data) {
    const nextState = this.transitions[[trigger, this.currentState.name] as any];
    if (nextState) {
      this.to(nextState, data);
    }
  }

  /**
   * 更新状态机内部的状态
   * @param {number}  deltaTime 两帧之间的时间
   */
  update(deltaTime) {
    this.machineTime += deltaTime;

    if (this.currentState && this.currentState.onTick) {
      const currentStateDuration = this.machineTime - this.currentState.startTime;
      this.currentState.onTick(deltaTime, currentStateDuration);
    }
  }
}

export { StateMachine as Machine };
