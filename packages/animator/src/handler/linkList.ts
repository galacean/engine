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

class LinkList<T> {
  public head: LinkNode<T>;
  public length: number = 0;
  public tail: LinkNode<T>;
  constructor() {
    this.head = null;
    this.tail = null;
  }

  append(data: T): boolean {
    let new_node = new LinkNode(data);
    if (this.head == null) {
      this.head = new_node;
      this.tail = new_node;
    } else {
      this.tail.next = new_node;
      new_node.prev = this.tail;
      this.tail = new_node;
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
      let insert_index = 1;
      let cur_node = this.head;
      while (insert_index < index) {
        cur_node = cur_node.next;
        insert_index++;
      }
      let next_node = cur_node.next;
      let new_node = new LinkNode(data);
      cur_node.next = new_node;
      new_node.prev = cur_node;
      new_node.next = next_node;
      next_node.prev = new_node;
    }
    this.length++;
    return true;
  }

  remove(index): LinkNode<T> {
    if (index < 0 || index >= this.length) {
      return null;
    } else {
      let del_node = null;
      if (index == 0) {
        del_node = this.head;
        this.head = this.head.next;
        this.head.prev = null;
      } else {
        let del_index = 0;
        let del_node = this.head;
        while (del_index < index) {
          del_index++;
          del_node = del_node.next;
        }
        let prev_node = del_node.prev;
        let next_node = del_node.next;
        prev_node.next = next_node;
        next_node.prev = prev_node;
        //如果删除的是尾节点
        if (del_node.next == null) {
          this.tail = prev_node;
        }
        this.length--;
        return del_node;
      }
    }
  }

  get(index): LinkNode<T> {
    if (index < 0 || index > this.length) {
      return null;
    }
    let node_index = 0;
    let cur_node = this.head;
    while (node_index < index) {
      node_index++;
      cur_node = cur_node.next;
    }
    return cur_node;
  }

  print(): void {
    let cur = this.head;
    while (cur != null) {
      console.log(cur.data);
      cur = cur.next;
    }
  }
}

export default LinkList;
