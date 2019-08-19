export default class Event {
  cancelBubble: boolean;
  cancelable: boolean;
  target: any;
  currentTarget: any;
  preventDefault: any;
  stopPropagation: any;
  type: any;
  timeStamp: number;

  constructor(type: any) {

    this.cancelBubble = false;
    this.cancelable = false;
    this.target = null;
    this.currentTarget = null;
    this.preventDefault = () => {
    };
    this.stopPropagation = () => {
    };

    this.type = type;
    this.timeStamp = Date.now()
  }
}
