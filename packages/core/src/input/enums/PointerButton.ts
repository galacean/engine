/**
 * Defines values that specify the buttons on a pointer device.
 * Refer to the W3C standards.(https://www.w3.org/TR/uievents/#dom-mouseevent-button)
 * Refer to Microsoft's documentation.(https://docs.microsoft.com/en-us/dotnet/api/system.windows.input.mousebutton?view=windowsdesktop-6.0)
 */
export enum PointerButton {
  /** Indicate the primary pointer of the device (in general, the left button or the only button on single-button devices, used to activate a user interface control or select text) or the un-initialized value. */
  Primary = 0,
  /** Indicate the auxiliary pointer (in general, the middle button, often combined with a mouse wheel). */
  Auxiliary = 1,
  /** Indicate the secondary pointer (in general, the right button, often used to display a context menu). */
  Secondary = 2,
  /** Indicate the X1 (back) pointer. */
  XButton1 = 3,
  /** Indicate the X2 (forward) pointer. */
  XButton2 = 4,
  /** Indicate the X3 pointer. */
  XButton3 = 5,
  /** Indicate the X4 pointer. */
  XButton4 = 6,
  /** Indicate the X5 pointer. */
  XButton5 = 7,
  /** Indicate the X6 pointer. */
  XButton6 = 8,
  /** Indicate the X7 pointer. */
  XButton7 = 9,
  /** Indicate the X8 pointer. */
  XButton8 = 10
}
