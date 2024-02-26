export class TextToken {
  text: string;
  start: IPosition;
  end: IPosition;

  constructor(text: string, start: IPosition, end: IPosition) {
    this.text = text;
    this.start = start;
    this.end = end;
  }
}
