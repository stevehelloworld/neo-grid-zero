const MUTE_KEY = 'neo-grid-muted-v1';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;
  private lastRadioAt = 0;

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      this.muted = false;
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(next: boolean): void {
    this.muted = next;
    try {
      localStorage.setItem(MUTE_KEY, next ? '1' : '0');
    } catch {
      // Ignore storage failures
    }
  }

  private ensureContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private tone(
    freq: number,
    duration: number,
    type: OscillatorType = 'sine',
    volume = 0.06,
    delay = 0,
    endFreq?: number,
  ): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const start = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, start);
      if (endFreq !== undefined) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), start + duration);
      }
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(volume, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + duration + 0.02);
    } catch {
      // Ignore audio edge errors
    }
  }

  public click(): void {
    this.tone(880, 0.045, 'triangle', 0.05, 0, 620);
  }

  public radioBlip(): void {
    const now = performance.now();
    if (now - this.lastRadioAt < 58) return;
    this.lastRadioAt = now;
    this.tone(1120 + (now % 180), 0.032, 'sine', 0.024, 0, 1280);
  }

  public deploy(): void {
    this.tone(240, 0.22, 'sawtooth', 0.045, 0, 740);
    this.tone(480, 0.2, 'triangle', 0.05, 0.08, 960);
  }

  public step(): void {
    this.tone(620, 0.038, 'square', 0.022, 0, 520);
  }

  public beam(): void {
    this.tone(1080, 0.14, 'sawtooth', 0.04, 0, 320);
    this.tone(1420, 0.09, 'sine', 0.04, 0.02, 860);
  }

  public shieldBreak(): void {
    this.tone(523.25, 0.14, 'triangle', 0.065, 0);
    this.tone(659.25, 0.14, 'triangle', 0.065, 0.05);
    this.tone(1046.5, 0.24, 'sine', 0.07, 0.1);
  }

  public hitError(): void {
    this.tone(220, 0.16, 'sawtooth', 0.065, 0, 130);
    this.tone(175, 0.22, 'sawtooth', 0.06, 0.11, 92);
  }

  public breachSuccess(): void {
    this.tone(587.33, 0.1, 'triangle', 0.06, 0);
    this.tone(783.99, 0.1, 'triangle', 0.06, 0.07);
    this.tone(1174.66, 0.22, 'sine', 0.065, 0.14);
  }

  public missionClear(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51];
    notes.forEach((n, idx) => {
      this.tone(n, idx === notes.length - 1 ? 0.36 : 0.13, 'triangle', 0.065, idx * 0.085);
    });
  }
}

export const sound = new SoundEngine();
