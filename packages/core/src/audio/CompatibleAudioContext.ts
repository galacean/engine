/**
 * 兼容 AudioContext 和 webkitAudioContext 的包装类。
 * 提供统一的接口，处理不同浏览器的兼容性问题。
 */
export class CompatibleAudioContext {
  private _audioContext: AudioContext;
  private _isResuming = false;

  constructor() {
    if (window.AudioContext) {
      this._audioContext = new AudioContext();
    } else if ((window as any).webkitAudioContext) {
      this._audioContext = new (window as any).webkitAudioContext() as AudioContext;
    } else {
      throw new Error("Web Audio API not supported.");
    }

    this._addResumeListeners();
  }

  private _addResumeListeners() {
    document.addEventListener("pointerdown", this._tryResume.bind(this));
    document.addEventListener("touchend", this._tryResume.bind(this));
    document.addEventListener("touchstart", this._tryResume.bind(this));
  }

  private _tryResume() {
    if (this._audioContext.state !== "running") {
      if (this._isResuming) {
        return;
      }

      this._isResuming = true;
      (this._audioContext as any).resume().then(() => {
        this._isResuming = false;
      });
    }
  }

  public get context(): AudioContext {
    return this._audioContext;
  }

  public get state(): AudioContextState {
    return this._audioContext.state as AudioContextState;
  }

  public get currentTime(): number {
    return this._audioContext.currentTime;
  }

  public get sampleRate(): number {
    return this._audioContext.sampleRate;
  }

  public get destination(): AudioDestinationNode {
    return this._audioContext.destination;
  }

  public get listener(): AudioListener {
    return this._audioContext.listener;
  }

  public decodeAudioData(
    arrayBuffer: ArrayBuffer,
    successCallback?: (decodedData: AudioBuffer) => void,
    errorCallback?: (error: Error) => void
  ): Promise<AudioBuffer> {
    return new Promise((resolve, reject) => {
      this._audioContext.decodeAudioData(
        arrayBuffer,
        (buffer: AudioBuffer) => {
          if (successCallback) successCallback(buffer);
          resolve(buffer);
        },
        (error: Error) => {
          const err = error || new Error("Failed to decode audio data");
          if (errorCallback) errorCallback(err);
          reject(err);
        }
      );
    });
  }

  public createBuffer(numberOfChannels: number, length: number, sampleRate: number): AudioBuffer {
    return this._audioContext.createBuffer(numberOfChannels, length, sampleRate);
  }

  public createBufferSource(): AudioBufferSourceNode {
    return this._audioContext.createBufferSource();
  }

  public createGain(): GainNode {
    if ((this._audioContext as any).createGain) {
      return (this._audioContext as any).createGain();
    } else if ((this._audioContext as any).createGainNode) {
      return (this._audioContext as any).createGainNode();
    }
    throw new Error("Create gain node is not supported.");
  }

  public createAnalyser(): AnalyserNode {
    return this._audioContext.createAnalyser();
  }

  public createBiquadFilter(): BiquadFilterNode {
    return this._audioContext.createBiquadFilter();
  }

  public createChannelMerger(numberOfInputs?: number): ChannelMergerNode {
    return this._audioContext.createChannelMerger(numberOfInputs);
  }

  public createChannelSplitter(numberOfOutputs?: number): ChannelSplitterNode {
    return this._audioContext.createChannelSplitter(numberOfOutputs);
  }

  public createConvolver(): ConvolverNode {
    return this._audioContext.createConvolver();
  }

  public createDelay(maxDelayTime?: number): DelayNode {
    if ((this._audioContext as any).createDelay) {
      return (this._audioContext as any).createDelay(maxDelayTime);
    } else if ((this._audioContext as any).createDelayNode) {
      return (this._audioContext as any).createDelayNode(maxDelayTime);
    }
    throw new Error("Create delay node is not supported.");
  }

  public createDynamicsCompressor(): DynamicsCompressorNode {
    return this._audioContext.createDynamicsCompressor();
  }

  public createOscillator(): OscillatorNode {
    return this._audioContext.createOscillator();
  }

  public createPanner(): PannerNode {
    return this._audioContext.createPanner();
  }

  public createPeriodicWave(
    real: Float32Array,
    imag: Float32Array,
    constraints?: PeriodicWaveConstraints
  ): PeriodicWave {
    if ((this._audioContext as any).createPeriodicWave) {
      return (this._audioContext as any).createPeriodicWave(real, imag, constraints);
    } else if ((this._audioContext as any).createWaveTable) {
      return (this._audioContext as any).createWaveTable(real, imag);
    }
    throw new Error("Create periodic wave is not supported.");
  }

  public createMediaElementSource(mediaElement: HTMLMediaElement): MediaElementAudioSourceNode {
    return this._audioContext.createMediaElementSource(mediaElement);
  }

  public createMediaStreamSource(mediaStream: MediaStream): MediaStreamAudioSourceNode {
    return this._audioContext.createMediaStreamSource(mediaStream);
  }

  public createMediaStreamDestination(): MediaStreamAudioDestinationNode {
    return this._audioContext.createMediaStreamDestination();
  }

  public resume(): Promise<void> {
    if (typeof this._audioContext.resume === "function") {
      return this._audioContext.resume();
    }
    return Promise.resolve();
  }

  public suspend(): Promise<void> {
    if (typeof this._audioContext.suspend === "function") {
      return this._audioContext.suspend();
    }
    return Promise.resolve();
  }

  public close(): Promise<void> {
    if (typeof this._audioContext.close === "function") {
      return this._audioContext.close();
    }
    return Promise.resolve();
  }
}
