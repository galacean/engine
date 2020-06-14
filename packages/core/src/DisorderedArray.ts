export class DisorderedArray<T> extends Array<T> {
  delete(child: any) {
    const index = this.indexOf(child);
    const tmp = this[index];
    this[index] = this[this.length - 1];
    this[this.length - 1] = tmp;
    this.pop();
  }
}
