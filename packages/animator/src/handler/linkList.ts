class LinkNode<T> {
  public data: T;
  public prev: LinkNode<T>;
  public next: LinkNode<T>;
  constructor(data: T) {
    this.data = data;
    this.prev = null;
    this.next = null;
  }
}

export class LinkList<T> {
  public head: LinkNode<T>;
  public length: number = 0;
  public tail: LinkNode<T>;
  constructor() {
    this.head = null;
    this.tail = null;
  }

  append(data: T): boolean {
    let newNode = new LinkNode(data);
    if (this.head == null) {
      this.head = newNode;
      this.tail = newNode;
    } else {
      this.tail.next = newNode;
      newNode.prev = this.tail;
      this.tail = newNode;
    }
    this.length++;
    return true;
  }

  len(): number {
    return this.length;
  }

  insert(index: number, data: T): boolean {
    if (index == this.length) {
      return this.append(data);
    } else {
      let insertIndex = 1;
      let curNode = this.head;
      while (insertIndex < index) {
        curNode = curNode.next;
        insertIndex++;
      }
      let nextNode = curNode.next;
      let newNode = new LinkNode(data);
      curNode.next = newNode;
      newNode.prev = curNode;
      newNode.next = nextNode;
      nextNode.prev = newNode;
    }
    this.length++;
    return true;
  }

  remove(index): LinkNode<T> {
    if (index < 0 || index >= this.length) {
      return null;
    } else {
      let delNode = null;
      if (index == 0) {
        delNode = this.head;
        this.head = this.head.next;
        this.head.prev = null;
      } else {
        let delIndex = 0;
        let delNode = this.head;
        while (delIndex < index) {
          delIndex++;
          delNode = delNode.next;
        }
        let prevNode = delNode.prev;
        let nextNode = delNode.next;
        prevNode.next = nextNode;
        nextNode.prev = prevNode;
        //如果删除的是尾节点
        if (delNode.next == null) {
          this.tail = prevNode;
        }
        this.length--;
        return delNode;
      }
    }
  }

  get(index): LinkNode<T> {
    if (index < 0 || index > this.length) {
      return null;
    }
    let nodeIndex = 0;
    let curNode = this.head;
    while (nodeIndex < index) {
      nodeIndex++;
      curNode = curNode.next;
    }
    return curNode;
  }

  print(): void {
    let cur = this.head;
    while (cur != null) {
      cur = cur.next;
    }
  }
}
