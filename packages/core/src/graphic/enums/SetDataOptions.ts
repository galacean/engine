/**
 * Define update strategy when call bufferData/bufferSubData func.
 */
export enum SetDataOptions {
  /** Can overwrite part of used buffer data and ensure correct rendering */
  None,
  /** Discard old buffer and create a new buffer, and won't affect the previous rendering */
  Discard
  ///** Need to ensure that the buffer data will not be overwritten, and won't interrupting rendering if setData immediately */
  //NoOverwrite
}
