/**
 * @internal
 * Audio Manager.
 */
export class AudioManager {
  private static _context: AudioContext | null = null;
  private static _gainNode: GainNode | null = null;
  private static _isResuming = false;
  private static _isAudioAvailable = true;
  private static _isWebKit = false;

  static getContext(): AudioContext | null {
    if (!AudioManager._isAudioAvailable) {
      return null;
    }
    
    let context = AudioManager._context;
    if (!context) {
      try {
        if (window.AudioContext) {
          AudioManager._context = context = new window.AudioContext();
          AudioManager._isWebKit = false;
        } else if (window.webkitAudioContext) {
          AudioManager._context = context = new window.webkitAudioContext();
          AudioManager._isWebKit = true;
        } else {
          console.error('当前环境不支持AudioContext或webkitAudioContext');
          AudioManager._isAudioAvailable = false;
          return null;
        }

        // Safari can't resume audio context without element interaction
        document.addEventListener("pointerdown", AudioManager._tryResume, true);
        document.addEventListener("touchend", AudioManager._tryResume, true);
        document.addEventListener("touchstart", AudioManager._tryResume, true);
      } catch (error) {
        console.error('创建AudioContext失败:', error);
        AudioManager._isAudioAvailable = false;
        return null;
      }
    }
    return context;
  }

  static getGainNode(): GainNode | null {
    if (!AudioManager._isAudioAvailable) {
      return null;
    }
    
    let gainNode = AudioManager._gainNode;
    if (!gainNode) {
      const context = AudioManager.getContext();
      if (!context) {
        return null;
      }
      
      try {
        AudioManager._gainNode = gainNode = context.createGain();
        gainNode.connect(context.destination);
      } catch (error) {
        console.error('创建GainNode失败:', error);
        return null;
      }
    }
    return gainNode;
  }

  static isAudioContextRunning(): boolean {
    if (!AudioManager._isAudioAvailable) {
      console.warn("当前环境不支持音频功能");
      return false;
    }
    
    const context = AudioManager.getContext();
    if (!context || context.state !== "running") {
      console.warn("The AudioContext is not running and requires user interaction, such as a click or touch.");
      return false;
    }
    return true;
  }

  static decodeAudioData(audioData: ArrayBuffer): Promise<AudioBuffer> {
    const context = AudioManager.getContext();
    if (!context) {
      return Promise.reject(new Error('AudioContext不可用'));
    }

    if (AudioManager._isWebKit) {
      return new Promise((resolve, reject) => {
        context.decodeAudioData(audioData, 
          (buffer) => resolve(buffer), 
          (error) => reject(error || new Error('解码音频失败'))
        );
      });
    } 

    else {
      return context.decodeAudioData(audioData);
    }
  }

  private static _tryResume(): void {
    const context = AudioManager._context;
    if (!context || context.state !== "running") {
      if (AudioManager._isResuming) {
        return;
      }

      AudioManager._isResuming = true;
      context?.resume().then(() => {
        AudioManager._isResuming = false;
      }).catch(error => {
        console.error('恢复AudioContext失败:', error);
        AudioManager._isResuming = false;
      });
    }
  }
}
