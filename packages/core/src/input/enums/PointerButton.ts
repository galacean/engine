/**
 * Defines values that specify the buttons on a pointer device.
 * Refer to the W3C standards:
 * (https://www.w3.org/TR/uievents/#dom-mouseevent-button)
 * (https://www.w3.org/TR/uievents/#dom-mouseevent-buttons)
 * Refer to Microsoft's documentation.(https://docs.microsoft.com/en-us/dotnet/api/system.windows.input.mousebutton?view=windowsdesktop-6.0)
 */
export enum PointerButton {
  /** No button. */
  None = 0x0,
  /** Indicate the primary pointer of the device (in general, the left button or the only button on single-button devices, used to activate a user interface control or select text) or the un-initialized value. */
  Primary = 0x1,
  /** Indicate the secondary pointer (in general, the right button, often used to display a context menu). */
  Secondary = 0x2,
  /** Indicate the auxiliary pointer (in general, the middle button, often combined with a mouse wheel). */
  Auxiliary = 0x4,
  /** Indicate the X1 (back) pointer. */
  XButton1 = 0x8,
  /** Indicate the X2 (forward) pointer. */
  XButton2 = 0x10,
  /** Indicate the X3 pointer. */
  XButton3 = 0x20,
  /** Indicate the X4 pointer. */
  XButton4 = 0x40,
  /** Indicate the X5 pointer. */
  XButton5 = 0x80,
  /** Indicate the X6 pointer. */
  XButton6 = 0x100,
  /** Indicate the X7 pointer. */
  XButton7 = 0x200,
  /** Indicate the X8 pointer. */
  XButton8 = 0x400
}

/**
 * @internal
 */
export const _pointerDec2BinMap = [
  PointerButton.Primary,
  PointerButton.Auxiliary,
  PointerButton.Secondary,
  PointerButton.XButton1,
  PointerButton.XButton2,
  PointerButton.XButton3,
  PointerButton.XButton4,
  PointerButton.XButton5,
  PointerButton.XButton6,
  PointerButton.XButton7,
  PointerButton.XButton8
];

/**
 * @internal
 */
export const _pointerBin2DecMap: Record<number, number> = {
  /** Primary */
  0x1: 0,
  /** Secondary */
  0x2: 2,
  /** Auxiliary */
  0x4: 1,
  /** XButton1 */
  0x8: 3,
  /** XButton2 */
  0x10: 4,
  /** XButton3 */
  0x20: 5,
  /** XButton4 */
  0x40: 6,
  /** XButton5 */
  0x80: 7,
  /** XButton6 */
  0x100: 8,
  /** XButton7 */
  0x200: 9,
  /** XButton8 */
  0x400: 10
};
