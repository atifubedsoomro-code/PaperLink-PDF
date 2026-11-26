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
   * Play a short FM-modulated robotic droid syllable through a resonant formant filter.
   */
  private triggerDroidSyllable(
    ctx: AudioContext,
    startAt: number,
    duration: number,
    startFreq: number,
    endFreq: number,
    opts?: {
      wave?: OscillatorType;
      modFreq?: number;
      modDepth?: number;
      filterFreq?: number;
      filterQ?: number;
      peakGain?: number;
    }
  ) {
    if (!this.masterGain) return;
    const wave = opts?.wave ?? 'square';
    const modFreq = opts?.modFreq ?? 72;
    const modDepth = opts?.modDepth ?? 90;
    const filterFreq = opts?.filterFreq ?? Math.max(600, (startFreq + endFreq) * 0.9);
    const filterQ = opts?.filterQ ?? 2.4;
    const peakGain = opts?.peakGain ?? 0.12;

    const carrier = ctx.createOscillator();
    carrier.type = wave;
    carrier.frequency.setValueAtTime(Math.max(40, startFreq), startAt);
    carrier.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), startAt + duration);

    const mod = ctx.createOscillator();
    mod.type = 'sine';
    mod.frequency.setValueAtTime(modFreq, startAt);

    const modGain = ctx.createGain();
    modGain.gain.setValueAtTime(modDepth, startAt);
    mod.connect(modGain);
    modGain.connect(carrier.frequency);

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(filterFreq, startAt);
    filter.Q.setValueAtTime(filterQ, startAt);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, startAt);
    env.gain.exponentialRampToValueAtTime(peakGain, startAt + Math.min(0.015, duration * 0.2));
    env.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

    carrier.connect(filter);
    filter.connect(env);
    env.connect(this.masterGain);

    carrier.start(startAt);
    mod.start(startAt);
    carrier.stop(startAt + duration + 0.02);
    mod.stop(startAt + duration + 0.02);
  }

  /**
   * Subtle robotic micro-chirp for curious or friendly telemetry cues.
   */
  public playRobotChirp(mood: 'happy' | 'curious' | 'notify' = 'happy') {
    if (this.isSoundMuted()) return;
    try {
      const ctx = this.ensureAudioGraph();
      if (!ctx || !this.masterGain) return;
      const now = ctx.currentTime;
      if (mood === 'curious') {
        this.triggerDroidSyllable(ctx, now, 0.09, 640, 1120, {
          wave: 'triangle',
          modFreq: 48,
          modDepth: 55,
          filterFreq: 1350,
          peakGain: 0.09,
        });
      } else if (mood === 'notify') {
        this.triggerDroidSyllable(ctx, now, 0.06, 880, 1180, {
          wave: 'triangle',
          modFreq: 35,
          modDepth: 25,
          filterFreq: 1600,
          peakGain: 0.075,
        });
        this.triggerDroidSyllable(ctx, now + 0.075, 0.08, 1320, 1568, {
          wave: 'sine',
          modFreq: 20,
          modDepth: 15,
          filterFreq: 1800,
          peakGain: 0.07,
        });
      } else {
        this.triggerDroidSyllable(ctx, now, 0.075, 760, 1180, {
          wave: 'square',
          modFreq: 65,
          modDepth: 75,
          filterFreq: 1500,
          peakGain: 0.09,
        });
      }
    } catch {
      // ignore audio restrictions
    }
  }

  /**
   * Excited playful robotic droid greeting ("Beep-Boop-Whirrr-Bip!") on clicking the robot.
   * Synthesized 100% via Web Audio API (no human voice or speech synthesis).
   */
  public playRobotExcitedHello() {
    if (this.isSoundMuted()) return;
    try {
      const ctx = this.ensureAudioGraph();
      if (!ctx || !this.masterGain) return;
      const now = ctx.currentTime;

      // 1. Opening friendly droid "Bip!"
      this.triggerDroidSyllable(ctx, now, 0.08, 560, 860, {
        wave: 'square',
        modFreq: 88,
        modDepth: 95,
        filterFreq: 1450,
        filterQ: 2.2,
        peakGain: 0.13,
      });

      // 2. Excited ascending robotic servo whistle with rapid vibrato ("Whirrr-beeeep!")
      const whistle = ctx.createOscillator();
      const harmonic = ctx.createOscillator();
      const vibrato = ctx.createOscillator();
      const vibratoGain = ctx.createGain();
      const formant = ctx.createBiquadFilter();
      const whistleGain = ctx.createGain();
      const whistleStart = now + 0.095;
      const whistleDur = 0.28;

      whistle.type = 'triangle';
      whistle.frequency.setValueAtTime(720, whistleStart);
      whistle.frequency.exponentialRampToValueAtTime(1340, whistleStart + 0.17);
      whistle.frequency.exponentialRampToValueAtTime(1160, whistleStart + whistleDur);

      harmonic.type = 'square';
      harmonic.frequency.setValueAtTime(1440, whistleStart);
      harmonic.frequency.exponentialRampToValueAtTime(2680, whistleStart + 0.17);
      harmonic.frequency.exponentialRampToValueAtTime(2320, whistleStart + whistleDur);

      vibrato.type = 'sine';
      vibrato.frequency.setValueAtTime(28, whistleStart);
      vibratoGain.gain.setValueAtTime(48, whistleStart);
      vibrato.connect(vibratoGain);
      vibratoGain.connect(whistle.frequency);
      vibratoGain.connect(harmonic.frequency);

      formant.type = 'bandpass';
      formant.frequency.setValueAtTime(1350, whistleStart);
      formant.frequency.exponentialRampToValueAtTime(2400, whistleStart + whistleDur);
      formant.Q.setValueAtTime(1.8, whistleStart);

      const harmonicGain = ctx.createGain();
      harmonicGain.gain.setValueAtTime(0.32, whistleStart);

      whistleGain.gain.setValueAtTime(0.0001, whistleStart);
      whistleGain.gain.exponentialRampToValueAtTime(0.15, whistleStart + 0.025);
      whistleGain.gain.exponentialRampToValueAtTime(0.0001, whistleStart + whistleDur);

      whistle.connect(formant);
      harmonic.connect(harmonicGain);
      harmonicGain.connect(formant);
      formant.connect(whistleGain);
      whistleGain.connect(this.masterGain);

      whistle.start(whistleStart);
      harmonic.start(whistleStart);
      vibrato.start(whistleStart);
      whistle.stop(whistleStart + whistleDur + 0.02);
      harmonic.stop(whistleStart + whistleDur + 0.02);
      vibrato.stop(whistleStart + whistleDur + 0.02);

      // 3. Crisp telemetry "Bi-Bip!" double-ping tail
      this.triggerDroidSyllable(ctx, now + 0.39, 0.065, 1480, 1760, {
        wave: 'sine',
        modFreq: 42,
        modDepth: 28,
        filterFreq: 1850,
        filterQ: 1.4,
        peakGain: 0.11,
      });
      this.triggerDroidSyllable(ctx, now + 0.47, 0.11, 1860, 2240, {
        wave: 'triangle',
        modFreq: 32,
        modDepth: 24,
        filterFreq: 2150,
        filterQ: 1.4,
        peakGain: 0.12,
      });
    } catch {
      // ignore audio restrictions
    }
  }

  /**
   * Annoyed / overloaded robotic warning buzz + grumpy droid scolding chirps + servo power-down droop
   * after 3-4 rapid clicks. 100% synthesized robotic sounds (no human voice or speech synthesis).
   */
  public playRobotAngrySigh() {
    if (this.isSoundMuted()) return;
    try {
      const ctx = this.ensureAudioGraph();
      if (!ctx || !this.masterGain) return;
      const now = ctx.currentTime;

      // 1. Sharp dual-pulse irritated robotic "BZZZT-BZZT!" overload alert
      [0, 0.095].forEach((offset) => {
        const start = now + offset;
        const dur = 0.075;
        const oscA = ctx.createOscillator();
        const oscB = ctx.createOscillator();
        const buzzMod = ctx.createOscillator();
        const buzzDepth = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();

        oscA.type = 'sawtooth';
        oscB.type = 'square';
        oscA.frequency.setValueAtTime(285, start);
        oscB.frequency.setValueAtTime(304, start);

        buzzMod.type = 'square';
        buzzMod.frequency.setValueAtTime(52, start);
        buzzDepth.gain.setValueAtTime(115, start);
        buzzMod.connect(buzzDepth);
        buzzDepth.connect(oscA.frequency);
        buzzDepth.connect(oscB.frequency);

        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(960, start);
        filter.Q.setValueAtTime(2.6, start);

        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.16, start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);

        oscA.connect(filter);
        oscB.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain!);

        oscA.start(start);
        oscB.start(start);
        buzzMod.start(start);
        oscA.stop(start + dur + 0.015);
        oscB.stop(start + dur + 0.015);
        buzzMod.stop(start + dur + 0.015);
      });

      // 2. Grumpy scolding astromech stepped descending chirps ("beep-brrt-boop-bwop!")
      const grumpySteps: Array<[number, number, number, number]> = [
        [0.2, 0.075, 590, 420],
        [0.29, 0.075, 490, 325],
        [0.38, 0.08, 405, 240],
        [0.475, 0.095, 325, 170],
      ];
      for (const [offset, dur, fStart, fEnd] of grumpySteps) {
        this.triggerDroidSyllable(ctx, now + offset, dur, fStart, fEnd, {
          wave: 'sawtooth',
          modFreq: 68,
          modDepth: 88,
          filterFreq: Math.max(520, fStart * 1.45),
          filterQ: 2.8,
          peakGain: 0.135,
        });
      }

      // 3. Exhausted robotic servo power-down droop + relay tick
      const droopStart = now + 0.59;
      const droopDur = 0.34;
      const droopOsc = ctx.createOscillator();
      const droopFilter = ctx.createBiquadFilter();
      const droopGain = ctx.createGain();

      droopOsc.type = 'square';
      droopOsc.frequency.setValueAtTime(410, droopStart);
      droopOsc.frequency.exponentialRampToValueAtTime(92, droopStart + droopDur);

      droopFilter.type = 'lowpass';
      droopFilter.frequency.setValueAtTime(1150, droopStart);
      droopFilter.frequency.exponentialRampToValueAtTime(280, droopStart + droopDur);
      droopFilter.Q.setValueAtTime(3.2, droopStart);

      droopGain.gain.setValueAtTime(0.0001, droopStart);
      droopGain.gain.exponentialRampToValueAtTime(0.13, droopStart + 0.025);
      droopGain.gain.exponentialRampToValueAtTime(0.0001, droopStart + droopDur);

      droopOsc.connect(droopFilter);
      droopFilter.connect(droopGain);
      droopGain.connect(this.masterGain);

      droopOsc.start(droopStart);
      droopOsc.stop(droopStart + droopDur + 0.02);
    } catch {
      // ignore audio restrictions
    }
  }
}

export const typewriterAudio = new TypewriterAudio();
