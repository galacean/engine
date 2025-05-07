import { Logger } from "./base/Logger";

/**
 * @internal
 */
export class Polyfill {
  static registerPolyfill(): void {
    Polyfill._registerMatchAll();
    Polyfill._registerAudioContext();
  }

  private static _registerMatchAll(): void {
    if (!String.prototype.matchAll) {
      Logger.info("polyfill String.prototype.matchAll");
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
    if (!window.AudioContext && (window as any).webkitAudioContext) {
      Logger.info("polyfill window.AudioContext");
      window.AudioContext = (window as any).webkitAudioContext;
    }

    if (window.AudioContext && window.AudioContext.prototype.decodeAudioData) {
      const originalDecodeAudioData = AudioContext.prototype.decodeAudioData;
      AudioContext.prototype.decodeAudioData = function (
        arrayBuffer: ArrayBuffer,
        successCallback?: Function,
        errorCallback?: Function
      ): Promise<AudioBuffer> {
        const promise = new Promise<AudioBuffer>((resolve, reject) => {
          originalDecodeAudioData.call(
            this,
            arrayBuffer,
            (buffer: AudioBuffer) => resolve(buffer),
            (error: Error) => reject(error || new Error("Failed to decode audio data"))
          );
        });

        if (successCallback || errorCallback) {
          promise.then(successCallback as any).catch(errorCallback as any);
        }

        return promise;
      };
    }
  }
}
