/**
 * Web Audio API synthesized typewriter sound effects.
 * Creates mechanical clack sounds and a subtle bell on line endings.
 */

class TypewriterAudio {
  private ctx: AudioContext | null = null;

  private initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  /**
   * Play a mechanical typewriter key click
   */
  public playKeyStroke() {
    try {
      this.initContext();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;

      // 1. Noise burst for key impact
      const bufferSize = this.ctx.sampleRate * 0.025; // 25ms
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.2));
      }

      const whiteNoise = this.ctx.createBufferSource();
      whiteNoise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1200 + Math.random() * 800, now);
      filter.Q.setValueAtTime(3, now);

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.35, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

      whiteNoise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.ctx.destination);

      whiteNoise.start(now);
      whiteNoise.stop(now + 0.035);

      // 2. Resonant body thud
      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(180 + Math.random() * 60, now);
      osc.frequency.exponentialRampToValueAtTime(60, now + 0.04);

      oscGain.gain.setValueAtTime(0.25, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

      osc.connect(oscGain);
      oscGain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.05);
    } catch {
      // Audio playback fails gracefully if user hasn't interacted or unsupported
    }
  }

  /**
   * Play a subtle key click on button hover
   */
  public playHoverTick() {
    try {
      this.initContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(950, now);
      osc.frequency.exponentialRampToValueAtTime(300, now + 0.018);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.018);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.02);
    } catch {}
  }

  /**
   * Unlock AudioContext cleanly inside a user gesture handler
   */
  public unlock() {
    try {
      this.initContext();
    } catch {
      // ignore restricted audio contexts
    }
  }

  /**
   * Softer, slower, lower-pitched mechanical typewriter click tuned for AI chat output
   */
  public playChatKeyStroke(isSpaceOrPunct = false) {
    try {
      this.initContext();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }

      // 1. Mellow mechanical key striker burst
      const durationSec = isSpaceOrPunct ? 0.036 : 0.026;
      const bufferSize = Math.max(64, Math.floor(this.ctx.sampleRate * durationSec));
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.24));
      }

      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(
        isSpaceOrPunct ? 520 + Math.random() * 140 : 820 + Math.random() * 280,
        now
      );
      filter.Q.setValueAtTime(2.4, now);

      const noiseGain = this.ctx.createGain();
      const peakNoise = isSpaceOrPunct ? 0.14 : 0.17;
      noiseGain.gain.setValueAtTime(peakNoise, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + durationSec);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.ctx.destination);

      noise.start(now);
      noise.stop(now + durationSec + 0.005);

      // 2. Warm wooden platen resonance thud
      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();
      osc.type = 'triangle';
      const baseFreq = isSpaceOrPunct ? 86 + Math.random() * 16 : 122 + Math.random() * 28;
      osc.frequency.setValueAtTime(baseFreq, now);
      osc.frequency.exponentialRampToValueAtTime(42, now + 0.048);

      oscGain.gain.setValueAtTime(isSpaceOrPunct ? 0.16 : 0.12, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.052);

      osc.connect(oscGain);
      oscGain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.055);
    } catch {
      // Audio playback fails gracefully if blocked
    }
  }

  /**
   * Gentle pop when sending a message or attaching a file in chat
   */
  public playSendTick() {
    try {
      this.initContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(540, now);
      osc.frequency.exponentialRampToValueAtTime(840, now + 0.045);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.075, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.065);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.075);
    } catch {}
  }

  /**
   * Subtle warm carriage-return chime when AI finishes typing a message
   */
  public playSoftBell() {
    try {
      this.initContext();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const harmonic = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const harmonicGain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(987.77, now); // warm B5 bell
      harmonic.type = 'sine';
      harmonic.frequency.setValueAtTime(1975.53, now);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.08, now + 0.014);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);

      harmonicGain.gain.setValueAtTime(0.0001, now);
      harmonicGain.gain.exponentialRampToValueAtTime(0.025, now + 0.012);
      harmonicGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

      osc.connect(gain);
      harmonic.connect(harmonicGain);
      gain.connect(this.ctx.destination);
      harmonicGain.connect(this.ctx.destination);

      osc.start(now);
      harmonic.start(now);
      osc.stop(now + 0.45);
      harmonic.stop(now + 0.25);
    } catch {}
  }

  /**
   * Play typewriter carriage return bell ding
   */
  public playBell() {
    try {
      this.initContext();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(2400, now);
      osc.frequency.setValueAtTime(2400, now + 0.02);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.85);
    } catch {}
  }
}

export const typewriterAudio = new TypewriterAudio();
