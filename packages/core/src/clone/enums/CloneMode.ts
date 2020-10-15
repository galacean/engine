/**
 * 克隆模式。
 */
export enum CloneMode {
  /* 忽略克隆。*/
  Ignore,
  /* 浅克隆,直接对字段或属性进行赋值。*/
  Shallow,
  /* 深克隆,会调用对象的 clone() 或 cloneTo() 实现克隆，需要对象实现 IClone 接口。*/
  Deep
}
