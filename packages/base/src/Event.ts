import { EventDispatcher } from "./EventDispatcher";

export type Listener = ((e: Event) => any) & { once?: boolean };

/** 事件对象* @class */
export class Event {

  get propagationStopped(): boolean {

    return this._propagationStopped;

  }

  get target(): EventDispatcher {

    return this._target;

  }

  set target(t) {

    this._target = t;

  }

  get timeStamp(): number {

    return this._timeStamp;

  }

  get currentTarget(): EventDispatcher {

    return this._currentTarget;

  }

  set currentTarget(t) {

    this._currentTarget = t;

  }

  get bubbles(): boolean {

    return this._bubbles;

  }

  get type(): string | number {

    return this._type;

  }

  public data: any;

  private _timeStamp: number;

  private _target: EventDispatcher;

  private _currentTarget: any;

  private _bubbles: boolean;

  private _propagationStopped: boolean;

  private _type: string | number;

  constructor(type: string | number, target: EventDispatcher = null, data: any = {}, bubbles: boolean = true) {

    this._timeStamp = (new Date()).getTime();
    this._target = target;
    this.data = data;
    this._currentTarget = null;
    this._bubbles = bubbles;
    this._propagationStopped = false;
    this._type = type;

  }

  public stopPropagation(): void {

    this._propagationStopped = true;

  }

}
