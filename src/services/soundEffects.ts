/**
 * Web Audio API synthesized mechanical keyboard & typewriter sound effects.
 * Uses pre-generated impulse noise buffers + soft dynamics compression so
 * rapid bursts sound tactile, warm, and never clip or stutter.
 */

class TypewriterAudio {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private shortClickBuffer: AudioBuffer | null = null;
  private spaceThumpBuffer: AudioBuffer | null = null;

  private ensureAudioGraph(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;

    if (!this.ctx || this.ctx.state === 'closed') {
      this.ctx = new AudioCtx();
      this.masterGain = null;
      this.shortClickBuffer = null;
      this.spaceThumpBuffer = null;
    }

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }

    if (!this.masterGain) {
      const compressor = this.ctx.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-16, this.ctx.currentTime);
      compressor.knee.setValueAtTime(18, this.ctx.currentTime);
      compressor.ratio.setValueAtTime(4, this.ctx.currentTime);
      compressor.attack.setValueAtTime(0.002, this.ctx.currentTime);
      compressor.release.setValueAtTime(0.08, this.ctx.currentTime);

      const master = this.ctx.createGain();
      master.gain.setValueAtTime(0.88, this.ctx.currentTime);
      master.connect(compressor);
      compressor.connect(this.ctx.destination);
      this.masterGain = master;
    }

    if (!this.shortClickBuffer) {
      const len = Math.max(128, Math.floor(this.ctx.sampleRate * 0.018));
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        // Sharp initial stem transient followed by damped spring decay
        const env = Math.exp(-i / (len * 0.18));
        data[i] = (Math.random() * 2 - 1) * env;
      }
      this.shortClickBuffer = buf;
    }

    if (!this.spaceThumpBuffer) {
      const len = Math.max(192, Math.floor(this.ctx.sampleRate * 0.032));
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        const env = Math.exp(-i / (len * 0.25));
        data[i] = (Math.random() * 2 - 1) * env;
      }
      this.spaceThumpBuffer = buf;
    }

    return this.ctx;
  }

  /**
   * Unlock AudioContext cleanly inside a user gesture handler.
   */
  public unlock() {
    try {
      this.ensureAudioGraph();
    } catch {
      // ignore restricted audio contexts
    }
  }

  /**
   * Play a layered mechanical keyboard switch press (tactile stem click + creamy keycap thock).
   */
  public playKeyStroke(isSpaceOrEnter = false) {
    try {
      const ctx = this.ensureAudioGraph();
      if (!ctx || !this.masterGain || !this.shortClickBuffer || !this.spaceThumpBuffer) return;

      const now = ctx.currentTime;
      const pitchJitter = 0.92 + Math.random() * 0.16;

      // 1. Crisp tactile switch leaf transient
      const transient = ctx.createBufferSource();
      transient.buffer = isSpaceOrEnter ? this.spaceThumpBuffer : this.shortClickBuffer;

      const bandpass = ctx.createBiquadFilter();
      bandpass.type = 'bandpass';
      bandpass.frequency.setValueAtTime(
        (isSpaceOrEnter ? 980 : 2150) * pitchJitter,
        now
      );
      bandpass.Q.setValueAtTime(isSpaceOrEnter ? 1.8 : 2.6, now);

      const clickGain = ctx.createGain();
      clickGain.gain.setValueAtTime(isSpaceOrEnter ? 0.22 : 0.26, now);
      clickGain.gain.exponentialRampToValueAtTime(0.001, now + (isSpaceOrEnter ? 0.03 : 0.018));

      transient.connect(bandpass);
      bandpass.connect(clickGain);
      clickGain.connect(this.masterGain);
      transient.start(now);
      transient.stop(now + 0.036);

      // 2. Keycap bottom-out housing thock (filtered low-mid resonance)
      const thockOsc = ctx.createOscillator();
      const lowpass = ctx.createBiquadFilter();
      const thockGain = ctx.createGain();

      thockOsc.type = 'triangle';
      const startFreq = (isSpaceOrEnter ? 108 : 162) * pitchJitter;
      thockOsc.frequency.setValueAtTime(startFreq, now);
      thockOsc.frequency.exponentialRampToValueAtTime(isSpaceOrEnter ? 44 : 58, now + 0.034);

      lowpass.type = 'lowpass';
      lowpass.frequency.setValueAtTime(isSpaceOrEnter ? 380 : 620, now);

      thockGain.gain.setValueAtTime(isSpaceOrEnter ? 0.26 : 0.19, now);
      thockGain.gain.exponentialRampToValueAtTime(0.001, now + 0.038);

      thockOsc.connect(lowpass);
      lowpass.connect(thockGain);
      thockGain.connect(this.masterGain);
      thockOsc.start(now);
      thockOsc.stop(now + 0.042);
    } catch {
      // Fail gracefully if Web Audio is blocked
    }
  }

  /**
   * Subtle tactile micro-switch click on button hover.
   */
  public playHoverTick() {
    try {
      const ctx = this.ensureAudioGraph();
      if (!ctx || !this.masterGain || !this.shortClickBuffer) return;
      const now = ctx.currentTime;

      const src = ctx.createBufferSource();
      src.buffer = this.shortClickBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(2400 + Math.random() * 350, now);
      filter.Q.setValueAtTime(3.2, now);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.065, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.014);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      src.start(now);
      src.stop(now + 0.018);
    } catch {
      // ignore
    }
  }

  /**
   * Mechanical keyboard click tuned for fast streaming AI chat messages (creamy PBT keycap feel).
   */
  public playChatKeyStroke(isSpaceOrPunct = false) {
    try {
      const ctx = this.ensureAudioGraph();
      if (!ctx || !this.masterGain || !this.shortClickBuffer || !this.spaceThumpBuffer) return;

      const now = ctx.currentTime;
      const jitter = 0.91 + Math.random() * 0.18;

      // 1. Crisp switch click
      const noise = ctx.createBufferSource();
      noise.buffer = isSpaceOrPunct ? this.spaceThumpBuffer : this.shortClickBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime((isSpaceOrPunct ? 780 : 1850) * jitter, now);
      filter.Q.setValueAtTime(isSpaceOrPunct ? 1.9 : 2.5, now);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(isSpaceOrPunct ? 0.14 : 0.165, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + (isSpaceOrPunct ? 0.028 : 0.016));

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.masterGain);
      noise.start(now);
      noise.stop(now + 0.034);

      // 2. Warm mechanical PBT bottom-out thock
      const osc = ctx.createOscillator();
      const lpf = ctx.createBiquadFilter();
      const oscGain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime((isSpaceOrPunct ? 92 : 142) * jitter, now);
      osc.frequency.exponentialRampToValueAtTime(42, now + 0.032);

      lpf.type = 'lowpass';
      lpf.frequency.setValueAtTime(isSpaceOrPunct ? 340 : 540, now);

      oscGain.gain.setValueAtTime(isSpaceOrPunct ? 0.16 : 0.12, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.036);

      osc.connect(lpf);
      lpf.connect(oscGain);
      oscGain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.04);
    } catch {
      // Fail gracefully if audio is blocked
    }
  }

  /**
   * Tactile Enter-key pop when sending a message or attaching a file in chat.
   */
  public playSendTick() {
    try {
      const ctx = this.ensureAudioGraph();
      if (!ctx || !this.masterGain) return;
      this.playKeyStroke(true);
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(560, now);
      osc.frequency.exponentialRampToValueAtTime(860, now + 0.045);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.06, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.065);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.075);
    } catch {
      // ignore
    }
  }

  /**
   * Subtle warm carriage-return chime when AI finishes typing a message.
   */
  public playSoftBell() {
    try {
      const ctx = this.ensureAudioGraph();
      if (!ctx || !this.masterGain) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const harmonic = ctx.createOscillator();
      const gain = ctx.createGain();
      const harmonicGain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(987.77, now);
      harmonic.type = 'sine';
      harmonic.frequency.setValueAtTime(1975.53, now);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.075, now + 0.014);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);

      harmonicGain.gain.setValueAtTime(0.0001, now);
      harmonicGain.gain.exponentialRampToValueAtTime(0.022, now + 0.012);
      harmonicGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);

      osc.connect(gain);
      harmonic.connect(harmonicGain);
      gain.connect(this.masterGain);
      harmonicGain.connect(this.masterGain);

      osc.start(now);
      harmonic.start(now);
      osc.stop(now + 0.42);
      harmonic.stop(now + 0.24);
    } catch {
      // ignore
    }
  }

  /**
   * Classic mechanical carriage-return ding with Enter key thock.
   */
  public playBell() {
    try {
      const ctx = this.ensureAudioGraph();
      if (!ctx || !this.masterGain) return;
      this.playKeyStroke(true);
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const harmonic = ctx.createOscillator();
      const gain = ctx.createGain();
      const hGain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(2093, now);
      harmonic.type = 'sine';
      harmonic.frequency.setValueAtTime(4186, now);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.16, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);

      hGain.gain.setValueAtTime(0.0001, now);
      hGain.gain.exponentialRampToValueAtTime(0.04, now + 0.008);
      hGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

      osc.connect(gain);
      harmonic.connect(hGain);
      gain.connect(this.masterGain);
      hGain.connect(this.masterGain);

      osc.start(now);
      harmonic.start(now);
      osc.stop(now + 0.7);
      harmonic.stop(now + 0.34);
    } catch {
      // ignore
    }
  }

  private isSoundMuted(): boolean {
    try {
      return typeof window !== 'undefined' && localStorage.getItem('paperlink_chat_sound') === 'muted';
    } catch {
      return false;
    }
  }

  /**
   * Exciting playful "Heloooooooooow!" vocalization + bright melodic chime on clicking the robot.
   */
  public playRobotExcitedHello() {
    if (this.isSoundMuted()) return;
    try {
      const ctx = this.ensureAudioGraph();
      if (ctx && this.masterGain) {
        const now = ctx.currentTime;
        // Playful ascending "He-loooooow!" formant glide + sparkle chord
        const notes = [523.25, 659.25, 783.99, 1046.5];
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const start = now + idx * 0.055;
          const dur = idx === notes.length - 1 ? 0.38 : 0.14;
          osc.type = idx === notes.length - 1 ? 'triangle' : 'sine';
          osc.frequency.setValueAtTime(freq, start);
          if (idx === notes.length - 1) {
            osc.frequency.exponentialRampToValueAtTime(freq * 1.12, start + 0.24);
          }
          gain.gain.setValueAtTime(0.0001, start);
          gain.gain.exponentialRampToValueAtTime(idx === notes.length - 1 ? 0.16 : 0.11, start + 0.018);
          gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
          osc.connect(gain);
          gain.connect(this.masterGain!);
          osc.start(start);
          osc.stop(start + dur + 0.02);
        });
      }

      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
          const utter = new SpeechSynthesisUtterance('Helloooooooooow!');
          utter.pitch = 1.55;
          utter.rate = 1.08;
          utter.volume = 0.85;
          window.speechSynthesis.speak(utter);
        } catch {
          // Speech synthesis optional
        }
      }
    } catch {
      // ignore audio restrictions
    }
  }

  /**
   * Exhausting "Ahhhhh!" sigh + annoyed robot voice after 3-4 rapid clicks.
   */
  public playRobotAngrySigh() {
    if (this.isSoundMuted()) return;
    try {
      const ctx = this.ensureAudioGraph();
      if (ctx && this.masterGain) {
        const now = ctx.currentTime;

        // 1. Breathy "Ahhhhh!" exhale noise sweep
        const sighLen = Math.floor(ctx.sampleRate * 0.85);
        const sighBuf = ctx.createBuffer(1, sighLen, ctx.sampleRate);
        const ch = sighBuf.getChannelData(0);
        for (let i = 0; i < sighLen; i++) {
          const t = i / sighLen;
          const env = Math.sin(Math.min(1, t * 4) * Math.PI * 0.5) * Math.pow(1 - t, 1.35);
          ch[i] = (Math.random() * 2 - 1) * env;
        }
        const noise = ctx.createBufferSource();
        noise.buffer = sighBuf;

        const formant = ctx.createBiquadFilter();
        formant.type = 'bandpass';
        formant.frequency.setValueAtTime(980, now);
        formant.frequency.exponentialRampToValueAtTime(340, now + 0.82);
        formant.Q.setValueAtTime(2.4, now);

        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.28, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.84);

        noise.connect(formant);
        formant.connect(noiseGain);
        noiseGain.connect(this.masterGain);
        noise.start(now);
        noise.stop(now + 0.86);

        // 2. Descending exasperated vocal tone ("Ahhhhh!")
        const osc = ctx.createOscillator();
        const lpf = ctx.createBiquadFilter();
        const oscGain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(275, now);
        osc.frequency.exponentialRampToValueAtTime(128, now + 0.78);

        lpf.type = 'lowpass';
        lpf.frequency.setValueAtTime(820, now);
        lpf.frequency.exponentialRampToValueAtTime(360, now + 0.78);

        oscGain.gain.setValueAtTime(0.0001, now);
        oscGain.gain.exponentialRampToValueAtTime(0.14, now + 0.06);
        oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);

        osc.connect(lpf);
        lpf.connect(oscGain);
        oscGain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.82);
      }

      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
          const utter = new SpeechSynthesisUtterance('Ahhhhh! Why are you disturbing me? Do your work!');
          utter.pitch = 0.76;
          utter.rate = 1.04;
          utter.volume = 0.9;
          window.speechSynthesis.speak(utter);
        } catch {
          // Speech synthesis optional
        }
      }
    } catch {
      // ignore audio restrictions
    }
  }
}

export const typewriterAudio = new TypewriterAudio();
