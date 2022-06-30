/**
 * Defines values that specify the buttons on a mouse device.
 * Refer to the W3C standards.(https://www.w3.org/TR/uievents/#dom-mouseevent-buttons)
 */
export enum PointerButton {
  /** No button. */
  None = 0x0,
  /** MUST indicate the primary button of the device (in general, the left button or the only button on single-button devices, used to activate a user interface control or select text) or the un-initialized value. */
  Left = 0x1,
  /** MUST indicate the secondary button (in general, the right button, often used to display a context menu). */
  Right = 0x2,
  /** MUST indicate the auxiliary button (in general, the middle button, often combined with a mouse wheel). */
  Middle = 0x4,
  /** MUST indicate the X1 (back) button. */
  XButton1 = 0x8,
  /** MUST indicate the X2 (forward) button. */
  XButton2 = 0x10,
  /** MUST indicate the X3 button. */
  XButton3 = 0x20,
  /** MUST indicate the X4 button. */
  XButton4 = 0x40,
  /** MUST indicate the X5 button. */
  XButton5 = 0x80,
  /** MUST indicate the X6 button. */
  XButton6 = 0x100,
  /** MUST indicate the X7 button. */
  XButton7 = 0x200,
  /** MUST indicate the X8 button. */
  XButton8 = 0x300
}
