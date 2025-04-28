/**
 * @internal
 * 自定义 AudioContext 代理类，处理兼容性问题
 */
class CompatAudioContext extends (window.AudioContext || window.webkitAudioContext as typeof AudioContext) {
  constructor() {
    super();
  }

  override decodeAudioData(arrayBuffer: ArrayBuffer, successCallback?: Function, errorCallback?: Function): Promise<AudioBuffer> {
    const originalMethod = super.decodeAudioData.bind(this);
    
    const promise = new Promise<AudioBuffer>((resolve, reject) => {
      originalMethod(
        arrayBuffer,
        (buffer: AudioBuffer) => resolve(buffer),
        (error: Error) => reject(error || new Error('Failed to decode audio data'))
      );
    });
    
    if (successCallback || errorCallback) {
      promise.then(successCallback as any).catch(errorCallback as any);
    }
    
    return promise;
  }
}

/**
 * @internal
 * Audio Manager.
 */
export class AudioManager {
  private static _context: AudioContext;
  private static _gainNode: GainNode;
  private static _isResuming = false;
  private static _hasAudio = true;

  private static _dummyContext: any = {
    currentTime: 0,
    state: "suspended",
    resume: () => Promise.resolve(),
    decodeAudioData: (arrayBuffer: ArrayBuffer) => Promise.resolve(null),
    createBufferSource: () => ({
      connect: () => {},
      disconnect: () => {},
      start: () => {},
      stop: () => {},
      buffer: null
    }),
    createGain: () => ({
      connect: () => {},
      disconnect: () => {},
      gain: { value: 1 }
    }),
    destination: {}
  };

  static getContext(): AudioContext {
    if (!AudioManager._context && AudioManager._hasAudio) {
      if (window.AudioContext || window.webkitAudioContext) {
        AudioManager._context = new CompatAudioContext();
        
        // Safari can't resume audio context without element interaction
        document.addEventListener("pointerdown", AudioManager._tryResume, true);
        document.addEventListener("touchend", AudioManager._tryResume, true);
        document.addEventListener("touchstart", AudioManager._tryResume, true);
      } else {
        console.warn("AudioContext is not supported in this environment");
        AudioManager._hasAudio = false;
      }
    }
    
    return AudioManager._context || (AudioManager._dummyContext as AudioContext);
  }

  static getGainNode(): GainNode {
    if (!AudioManager._gainNode && AudioManager._hasAudio) {
      const context = AudioManager.getContext();
      if (AudioManager._hasAudio) {
        AudioManager._gainNode = context.createGain();
        AudioManager._gainNode.connect(context.destination);
      }
    }
    
    return AudioManager._gainNode || (AudioManager._dummyContext.createGain() as GainNode);
  }

  static isAudioContextRunning(): boolean {
    if (!AudioManager._hasAudio) return false;
    
    const context = AudioManager.getContext();
    if (context.state !== "running") {
      console.warn("The AudioContext is not running and requires user interaction, such as a click or touch.");
      return false;
    }
    return true;
  }

  private static _tryResume(): void {
    if (!AudioManager._context || !AudioManager._hasAudio) return;
    
    if (AudioManager._context.state !== "running") {
      if (AudioManager._isResuming) {
        return;
      }

      AudioManager._isResuming = true;
      AudioManager._context.resume().then(() => {
        AudioManager._isResuming = false;
      }).catch(() => {
        AudioManager._isResuming = false;
      });
    }
  }
}
