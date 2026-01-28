# Audio System

## System Overview

The Audio System provides basic audio playback capabilities for the Galacean 3D engine using the Web Audio API. It supports audio clip loading, playback control, volume adjustment, and automatic lifecycle management through component-based architecture.

## Core Architecture

### AudioManager (Context Management)
```typescript
// Get audio context (automatically initialized)
const context = AudioManager.getContext();

// Check if audio context is running (requires user interaction)
if (AudioManager.isAudioContextRunning()) {
  console.log("Audio is ready to play");
} else {
  console.warn("Audio requires user interaction to start");
}

// Get master gain node for global volume control
const masterGain = AudioManager.getGainNode();
masterGain.gain.value = 0.5; // 50% global volume
```

### AudioClip (Audio Asset)
```typescript
// Create audio clip from loaded audio buffer
const audioClip = new AudioClip(engine, "backgroundMusic");
audioClip.setAudioSource(audioBuffer); // Set decoded audio data

// Access audio properties
console.log(`Duration: ${audioClip.duration} seconds`);
console.log(`Sample Rate: ${audioClip.sampleRate} Hz`);
console.log(`Channels: ${audioClip.channels}`);
```

### AudioSource (Component-Based Playback)
```typescript
// Add AudioSource component to entity
const audioEntity = engine.sceneManager.activeScene.createEntity("AudioPlayer");
const audioSource = audioEntity.addComponent(AudioSource);

// Configure audio source
audioSource.clip = audioClip;
audioSource.volume = 0.8;
audioSource.loop = true;
audioSource.playOnEnabled = true;

// Manual playback control
audioSource.play();   // Start playback
audioSource.pause();  // Pause playback
audioSource.stop();   // Stop and reset playback
```

## Audio Clip Management

### Loading and Creating Audio Clips
```typescript
// Load audio file and create clip
async function loadAudioClip(engine: Engine, url: string): Promise<AudioClip> {
  // Fetch audio file
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  
  // Decode audio data
  const context = AudioManager.getContext();
  const audioBuffer = await context.decodeAudioData(arrayBuffer);
  
  // Create clip
  const clip = new AudioClip(engine, url.split('/').pop());
  clip.setAudioSource(audioBuffer);
  
  return clip;
}

// Usage
const musicClip = await loadAudioClip(engine, "/assets/music/background.mp3");
const sfxClip = await loadAudioClip(engine, "/assets/sfx/explosion.wav");
```

### Audio Clip Properties
```typescript
// Access audio information
const clip = audioSource.clip;
if (clip) {
  console.log(`Audio: ${clip.name}`);
  console.log(`Duration: ${clip.duration}s`);
  console.log(`Sample Rate: ${clip.sampleRate}Hz`);
  console.log(`Channels: ${clip.channels} (${clip.channels === 1 ? 'Mono' : 'Stereo'})`);
}

// Resource management (automatic with reference counting)
audioSource.clip = newClip; // Old clip reference count decreases
audioSource.clip = null;    // Release clip reference
```

## AudioSource Component API

### Basic Properties
```typescript
// Clip assignment
audioSource.clip: AudioClip | null

// Auto-play configuration
audioSource.playOnEnabled: boolean = true

// Playback state (read-only)
audioSource.isPlaying: boolean

// Playback position in seconds (read-only)
audioSource.time: number
```

### Volume Control
```typescript
// Volume control (0.0 to 1.0)
audioSource.volume: number = 1.0

// Mute/unmute functionality
audioSource.mute: boolean
// When muted, volume becomes 0; when unmuted, volume is restored

// Example usage
audioSource.volume = 0.5;     // 50% volume
audioSource.mute = true;      // Mute audio
audioSource.mute = false;     // Unmute and restore previous volume
```

### Playback Control
```typescript
// Playback rate adjustment (speed control)
audioSource.playbackRate: number = 1.0

// Loop configuration
audioSource.loop: boolean = false

// Example usage
audioSource.playbackRate = 0.8;  // 80% speed (slower)
audioSource.playbackRate = 1.5;  // 150% speed (faster)
audioSource.loop = true;         // Enable looping
```

### Playback Methods
```typescript
// Start playback
audioSource.play(): void

// Pause playback (preserves position)
audioSource.pause(): void

// Stop playback (resets position to start)
audioSource.stop(): void

// Example usage
if (!audioSource.isPlaying) {
  audioSource.play();
}

// Pause at current position
audioSource.pause();
console.log(`Paused at ${audioSource.time} seconds`);

// Resume from paused position
audioSource.play();

// Reset to beginning
audioSource.stop();
console.log(`Position reset: ${audioSource.time} seconds`); // 0
```

## Practical Examples

### Background Music System
```typescript
class MusicManager {
  private audioSource: AudioSource;
  private musicClips: Map<string, AudioClip> = new Map();
  private currentTrack: string | null = null;

  constructor(engine: Engine) {
    const musicEntity = engine.sceneManager.activeScene.createEntity("MusicManager");
    this.audioSource = musicEntity.addComponent(AudioSource);
    this.audioSource.loop = true;
    this.audioSource.volume = 0.7;
    this.audioSource.playOnEnabled = false;
  }

  async loadTrack(name: string, url: string): Promise<void> {
    const clip = await this.loadAudioClip(url);
    this.musicClips.set(name, clip);
  }

  playTrack(name: string): void {
    const clip = this.musicClips.get(name);
    if (clip) {
      this.audioSource.stop();
      this.audioSource.clip = clip;
      this.audioSource.play();
      this.currentTrack = name;
    }
  }

  setVolume(volume: number): void {
    this.audioSource.volume = Math.max(0, Math.min(1, volume));
  }

  fadeOut(duration: number): void {
    const startVolume = this.audioSource.volume;
    const fadeStep = startVolume / (duration * 60); // Assuming 60 FPS

    const fadeInterval = setInterval(() => {
      this.audioSource.volume = Math.max(0, this.audioSource.volume - fadeStep);
      
      if (this.audioSource.volume <= 0) {
        this.audioSource.stop();
        clearInterval(fadeInterval);
      }
    }, 1000 / 60);
  }

  private async loadAudioClip(url: string): Promise<AudioClip> {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await AudioManager.getContext().decodeAudioData(arrayBuffer);
    
    const clip = new AudioClip(this.audioSource.entity.engine, url);
    clip.setAudioSource(audioBuffer);
    return clip;
  }
}

// Usage
const musicManager = new MusicManager(engine);
await musicManager.loadTrack("menu", "/audio/menu-theme.mp3");
await musicManager.loadTrack("gameplay", "/audio/game-theme.mp3");

musicManager.playTrack("menu");
```

### Sound Effects Pool
```typescript
class SFXManager {
  private sfxPool: AudioSource[] = [];
  private sfxClips: Map<string, AudioClip> = new Map();
  private poolSize = 8;

  constructor(engine: Engine) {
    const scene = engine.sceneManager.activeScene;
    
    // Create pool of AudioSource components
    for (let i = 0; i < this.poolSize; i++) {
      const sfxEntity = scene.createEntity(`SFX_${i}`);
      const audioSource = sfxEntity.addComponent(AudioSource);
      audioSource.playOnEnabled = false;
      audioSource.loop = false;
      this.sfxPool.push(audioSource);
    }
  }

  async loadSFX(name: string, url: string): Promise<void> {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await AudioManager.getContext().decodeAudioData(arrayBuffer);
    
    const clip = new AudioClip(this.sfxPool[0].entity.engine, name);
    clip.setAudioSource(audioBuffer);
    this.sfxClips.set(name, clip);
  }

  playSFX(name: string, volume: number = 1.0): void {
    const clip = this.sfxClips.get(name);
    if (!clip) return;

    // Find available AudioSource in pool
    const availableSource = this.sfxPool.find(source => !source.isPlaying);
    if (availableSource) {
      availableSource.clip = clip;
      availableSource.volume = volume;
      availableSource.play();
    }
  }

  stopAllSFX(): void {
    this.sfxPool.forEach(source => {
      if (source.isPlaying) {
        source.stop();
      }
    });
  }
}

// Usage
const sfxManager = new SFXManager(engine);
await sfxManager.loadSFX("jump", "/audio/sfx/jump.wav");
await sfxManager.loadSFX("explosion", "/audio/sfx/explosion.wav");

// Play sound effects
sfxManager.playSFX("jump", 0.8);
sfxManager.playSFX("explosion", 1.0);
```

### Audio Settings Controller
```typescript
class AudioSettings {
  private musicSources: AudioSource[] = [];
  private sfxSources: AudioSource[] = [];

  registerMusicSource(source: AudioSource): void {
    this.musicSources.push(source);
  }

  registerSFXSource(source: AudioSource): void {
    this.sfxSources.push(source);
  }

  setMasterVolume(volume: number): void {
    const masterGain = AudioManager.getGainNode();
    masterGain.gain.setValueAtTime(volume, AudioManager.getContext().currentTime);
  }

  setMusicVolume(volume: number): void {
    this.musicSources.forEach(source => {
      source.volume = volume;
    });
  }

  setSFXVolume(volume: number): void {
    this.sfxSources.forEach(source => {
      source.volume = volume;
    });
  }

  muteAll(muted: boolean): void {
    [...this.musicSources, ...this.sfxSources].forEach(source => {
      source.mute = muted;
    });
  }
}

// Usage
const audioSettings = new AudioSettings();
audioSettings.setMasterVolume(0.8);
audioSettings.setMusicVolume(0.6);
audioSettings.setSFXVolume(0.9);
```

## Best Practices

### Performance Optimization
- **Audio Pool**: Use object pooling for frequent sound effects to avoid creating/destroying AudioSource components
- **Clip Reuse**: Share AudioClip instances between multiple AudioSource components
- **Context Management**: Always check `AudioManager.isAudioContextRunning()` before playing audio
- **Resource Cleanup**: Set `audioSource.clip = null` when no longer needed to release references

### User Interaction Requirements
```typescript
// Handle browser's autoplay policy
function initializeAudio(): void {
  if (!AudioManager.isAudioContextRunning()) {
    // Display "Click to Enable Audio" prompt to user
    document.addEventListener('click', resumeAudio, { once: true });
  }
}

function resumeAudio(): void {
  const context = AudioManager.getContext();
  if (context.state === 'suspended') {
    context.resume().then(() => {
      console.log('Audio context resumed');
    });
  }
}
```

### Error Handling
```typescript
// Robust audio loading with error handling
async function safeLoadAudio(engine: Engine, url: string): Promise<AudioClip | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load audio: ${response.status} ${response.statusText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await AudioManager.getContext().decodeAudioData(arrayBuffer);
    
    const clip = new AudioClip(engine, url);
    clip.setAudioSource(audioBuffer);
    return clip;
    
  } catch (error) {
    console.error(`Audio loading failed for ${url}:`, error);
    return null;
  }
}

// Safe audio playback
function safePlay(audioSource: AudioSource): void {
  if (!audioSource.clip) {
    console.warn("Cannot play: no audio clip assigned");
    return;
  }
  
  if (!AudioManager.isAudioContextRunning()) {
    console.warn("Cannot play: audio context not running (requires user interaction)");
    return;
  }
  
  audioSource.play();
}
```

## API Reference

```apidoc
AudioManager:
  Static Methods:
    getContext(): AudioContext
      - Returns the shared Web Audio API context.
    getGainNode(): GainNode
      - Returns the master gain node for global volume control.
    isAudioContextRunning(): boolean
      - Checks if audio context is in 'running' state.

AudioClip:
  Properties:
    name: string
      - The name identifier for this audio clip.
    duration: number
      - Duration of the audio clip in seconds.
    sampleRate: number
      - Sample rate of the audio data in Hz.
    channels: number
      - Number of audio channels (1 = mono, 2 = stereo).
  
  Methods:
    setAudioSource(audioBuffer: AudioBuffer): void
      - Sets the decoded audio data for this clip.

AudioSource:
  Properties:
    clip: AudioClip | null
      - The audio clip to play. @defaultValue `null`
    playOnEnabled: boolean
      - If true, audio plays automatically when component is enabled. @defaultValue `true`
    isPlaying: boolean
      - Whether audio is currently playing (read-only).
    volume: number
      - Volume level from 0.0 to 1.0. @defaultValue `1.0`
    playbackRate: number
      - Playback speed multiplier. @defaultValue `1.0`
    loop: boolean
      - Whether audio should loop when it reaches the end. @defaultValue `false`
    mute: boolean
      - Mute state (preserves volume setting).
    time: number
      - Current playback position in seconds (read-only).

  Methods:
    play(): void
      - Starts or resumes audio playback.
    pause(): void
      - Pauses audio playback, preserving current position.
    stop(): void
      - Stops audio playback and resets position to start.
```

## Limitations

- **No 3D Spatial Audio**: The current audio system does not support 3D positioning or spatial audio effects
- **Browser Autoplay Policy**: Audio playback requires user interaction to start due to browser autoplay restrictions  
- **Web Audio API Only**: Audio system is built on Web Audio API and requires modern browser support
- **No Audio Streaming**: All audio must be fully loaded before playback (no streaming support)