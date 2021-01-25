/**
 * Buffer usage.
 */
export enum BufferUsage {
  /** The buffer content are intended to be specified once, and used many times */
  Static,
  /** The buffer contents are intended to be respecified repeatedly, and used many times */
  Dynamic,
  /** The buffer contents are intended to be specified once, and used at most a few times */
  Stream
}
