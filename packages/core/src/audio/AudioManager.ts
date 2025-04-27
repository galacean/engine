/**
 * @internal
 * Audio Manager.
 */
export class AudioManager {
  private static _context: AudioContext;
  private static _gainNode: GainNode;
  private static _isResuming = false;

  static getContext(): AudioContext {
    let context = AudioManager._context;
    if (!context) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      
      if (!AudioContextClass) {
        console.error('当前环境不支持AudioContext或webkitAudioContext');
        return AudioManager._context = {} as AudioContext;
      }
      
      AudioManager._context = context = new AudioContextClass();

      if (context.decodeAudioData && !context.decodeAudioData.toString().includes('return')) {
        const originalDecodeAudioData = context.decodeAudioData.bind(context);
        context.decodeAudioData = (audioData: ArrayBuffer, successCallback?: (decodedData: AudioBuffer) => void, errorCallback?: (error: Error) => void) => {
          return new Promise((resolve, reject) => {
            originalDecodeAudioData(audioData, 
              (buffer) => {
                if (successCallback) successCallback(buffer);
                resolve(buffer);
              }, 
              (error) => {
                if (errorCallback) errorCallback(error || new Error('解码音频失败'));
                reject(error || new Error('解码音频失败'));
              }
            );
          });
        };
      }

      // Safari can't resume audio context without element interaction
      document.addEventListener("pointerdown", AudioManager._tryResume, true);
      document.addEventListener("touchend", AudioManager._tryResume, true);
      document.addEventListener("touchstart", AudioManager._tryResume, true);
    }
    return context;
  }

  static getGainNode(): GainNode {
    let gainNode = AudioManager._gainNode;
    if (!AudioManager._gainNode) {
      try {
        const context = AudioManager.getContext();
        if (context.createGain) {
          AudioManager._gainNode = gainNode = context.createGain();
          gainNode.connect(context.destination);
        } else {
          console.error('当前环境不支持createGain方法');
          return {} as GainNode;
        }
      } catch (error) {
        console.error('创建GainNode失败:', error);
        return {} as GainNode;
      }
    }
    return gainNode;
  }

  static isAudioContextRunning(): boolean {
    const context = AudioManager.getContext();
    if (!context.state || context.state !== "running") {
      console.warn("The AudioContext is not running and requires user interaction, such as a click or touch.");
      return false;
    }
    return true;
  }

  private static _tryResume(): void {
    const context = AudioManager._context;
    if (context && context.state && context.state !== "running" && context.resume) {
      if (AudioManager._isResuming) {
        return;
      }

      AudioManager._isResuming = true;
      context.resume().then(() => {
        AudioManager._isResuming = false;
      }).catch(error => {
        console.error('恢复AudioContext失败:', error);
        AudioManager._isResuming = false;
      });
    }
  }
}
