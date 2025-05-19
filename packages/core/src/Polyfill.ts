import { Logger } from "./base/Logger";

/**
 * @internal
 */
export class Polyfill {
  static registerPolyfill(): void {
    Polyfill._registerMatchAll();
    Polyfill._registerAudioContext();
    Polyfill._registerMeasureText();
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

  private static _registerMeasureText(): void {
    if (!("actualBoundingBoxLeft" in TextMetrics.prototype)) {
      Object.defineProperties(TextMetrics.prototype, {
        actualBoundingBoxLeft: {
          get: function () {
            return this.width; // 将 actualBoundingBoxLeft 的值与 width 保持一致
          },
          configurable: true,
          enumerable: true
        },
        actualBoundingBoxRight: {
          get: function () {
            return 0;
          },
          configurable: true,
          enumerable: true
        }
      });
    }
  }
}
