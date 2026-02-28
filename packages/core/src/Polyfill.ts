import { Logger } from "./base/Logger";

/**
 * @internal
 */
export class Polyfill {
  static registerPolyfill(): void {
    Polyfill._registerMatchAll();
    Polyfill._registerAudioContext();
    Polyfill._registerTextMetrics();
    Polyfill._registerPromiseFinally();
  }

  private static _registerMatchAll(): void {
    if (!String.prototype.matchAll) {
      Logger.info("Polyfill String.prototype.matchAll");
      String.prototype.matchAll = function (pattern: RegExp): ReturnType<String["matchAll"]> {
        const flags = pattern.flags;
        const globalFlagIdx = flags.indexOf("g");
        if (globalFlagIdx === -1) {
          throw TypeError("String.prototype.matchAll called with a non-global RegExp argument");
        }
        const bindThis = this as string;

        return (function* () {
          const matchResult = bindThis.match(pattern) as string[];
          if (matchResult == null) return null;
          const matchFlag = flags.split("g").join("");
          const matchPattern = new RegExp(pattern.source, matchFlag);

          for (let index in matchResult) {
            const item = matchResult[index];
            yield item.match(matchPattern) as RegExpExecArray;
          }
        })();
      };
    }
  }

  private static _registerAudioContext(): void {
    // IOS 12 and the following system do not support AudioContext, need to switch to webkitAudioContext
    if (!window.AudioContext && (window as any).webkitAudioContext) {
      Logger.info("Polyfill window.AudioContext");
      window.AudioContext = (window as any).webkitAudioContext;

      const originalDecodeAudioData = AudioContext.prototype.decodeAudioData as (
        audioData: ArrayBuffer,
        successCallback?: DecodeSuccessCallback | null,
        errorCallback?: DecodeErrorCallback | null
      ) => void;

      AudioContext.prototype.decodeAudioData = function (
        arrayBuffer: ArrayBuffer,
        successCallback?: DecodeSuccessCallback | null,
        errorCallback?: DecodeErrorCallback | null
      ): Promise<AudioBuffer> {
        return new Promise<AudioBuffer>((resolve, reject) => {
          originalDecodeAudioData.call(
            this,
            arrayBuffer,
            (buffer: AudioBuffer) => {
              successCallback?.(buffer);
              resolve(buffer);
            },
            (error: DOMException) => {
              errorCallback?.(error);
              reject(error);
            }
          );
        });
      };
    }
  }

  private static _registerTextMetrics(): void {
    // Based on the specific version of the engine implementation, when actualBoundingBoxLeft is not supported, width is used to represent the rendering width, and `textAlign` uses the default value `start` and direction is left to right.
    // Some devices do not support actualBoundingBoxLeft and actualBoundingBoxRight in TextMetrics.
    // Examples: Google Pixel 2 XL (Android 11), Honor 6X (Android 8).
    // In WeChat Mini Games, TextMetrics may be reported as not defined, so a check for window.TextMetrics is added.
    if (window.TextMetrics && !("actualBoundingBoxLeft" in TextMetrics.prototype)) {
      Object.defineProperties(TextMetrics.prototype, {
        actualBoundingBoxLeft: {
          get: function () {
            return 0;
          }
        },
        actualBoundingBoxRight: {
          get: function () {
            return this.width;
          }
        }
      });
    }
  }

  private static _registerPromiseFinally(): void {
    // iOS Safari 10.0-10.2 and older versions do not support Promise.prototype.finally
    // Examples: iPhone 6s and below devices without system upgrade
    if (!Promise.prototype.finally) {
      Logger.info("Polyfill Promise.prototype.finally");
      Promise.prototype.finally = function <T>(this: Promise<T>, onFinally?: () => void): Promise<T> {
        return this.then(
          (value) => Promise.resolve(onFinally?.()).then(() => value),
          (reason) =>
            Promise.resolve(onFinally?.()).then(() => {
              throw reason;
            })
        );
      };
    }
  }
}
