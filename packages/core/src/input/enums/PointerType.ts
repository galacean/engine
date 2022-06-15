/**
 * Defines values that specify the buttons on a mouse device.
 * Refer to the W3C standards.(https://www.w3.org/TR/uievents/#dom-mouseevent-button)
 * Refer to Microsoft's documentation.(https://docs.microsoft.com/en-us/dotnet/api/system.windows.input.mousebutton?view=windowsdesktop-6.0)
 */
export enum PointerButton {
  // MUST indicate the primary button of the device (in general, the left button or the only button on single-button devices, used to activate a user interface control or select text) or the un-initialized value.
  Left = 0,
  // MUST indicate the auxiliary button (in general, the middle button, often combined with a mouse wheel).
  Middle = 1,
  // MUST indicate the secondary button (in general, the right button, often used to display a context menu).
  Right = 2,
  // MUST indicate the X1 (back) button.
  XButton1 = 3,
  // MUST indicate the X2 (forward) button.
  XButton2 = 4,
  // MUST indicate the X3 button.
  XButton3 = 5,
  // MUST indicate the X4 button.
  XButton4 = 6,
  // MUST indicate the X5 button.
  XButton5 = 7,
  // MUST indicate the X6 button.
  XButton6 = 8,
  // MUST indicate the X7 button.
  XButton7 = 9,
  // MUST indicate the X8 button.
  XButton8 = 10
}
