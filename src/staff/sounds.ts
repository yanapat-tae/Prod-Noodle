export type StaffSound = 'order' | 'payment';

// Keep peaks below full scale while giving small phone speakers a clear attack.
// The two bell strikes and the rising four-note receipt have different rhythms/timbres.
export function scheduleStaffSound(
  context: BaseAudioContext,
  kind: StaffSound,
  start: number,
  track: (node: OscillatorNode) => void = () => {},
) {
  function tone(
    frequency: number,
    offset: number,
    duration: number,
    volume: number,
    type: OscillatorType,
  ) {
    const oscillator = context.createOscillator(),
      gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    oscillator.connect(gain);
    gain.connect(context.destination);
    const at = start + offset;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(volume, at + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, at + duration);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
    track(oscillator);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.01);
  }
  if (kind === 'order') {
    for (const offset of [0, 0.6]) {
      tone(1046.5, offset, 0.8, 0.55, 'sine');
      tone(2799, offset, 0.4, 0.14, 'sine');
      tone(4301, offset, 0.25, 0.06, 'sine');
    }
    return 1.5;
  }
  [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) =>
    tone(frequency, index * 0.18, index === 3 ? 0.6 : 0.17, 0.7, 'triangle'),
  );
  return 1.25;
}

export class StaffSoundPlayer {
  private context: AudioContext | null = null;
  private enabled = false;
  private nextAt = 0;
  private lastKind: StaffSound | null = null;
  private nodes = new Set<OscillatorNode>();
  private generation = 0;

  // Called directly from a tap, including before the asynchronous payment request.
  async enable(): Promise<boolean> {
    // Each tap supersedes previous resume requests as well as muted sessions.
    const generation = ++this.generation;
    try {
      this.context ??= new AudioContext();
      const context = this.context;
      await context.resume();
      if (generation !== this.generation || context !== this.context) return false;
      this.enabled = context.state === 'running';
    } catch {
      if (generation !== this.generation) return false;
      this.enabled = false;
    }
    return this.enabled;
  }
  async prepare() {
    if (this.enabled) {
      try {
        await this.context?.resume();
      } catch {
        /* Playback reports unavailable audio separately. */
      }
    }
  }
  disable() {
    this.enabled = false;
    this.generation++;
    this.nextAt = 0;
    this.lastKind = null;
    for (const node of this.nodes) {
      try {
        node.stop();
      } catch {
        /* Already ended. */
      }
    }
    this.nodes.clear();
  }
  async play(kind: StaffSound): Promise<boolean> {
    if (!this.enabled || !this.context) return true;
    const generation = this.generation,
      context = this.context;
    try {
      await context.resume();
      if (!this.enabled || generation !== this.generation || context !== this.context) return true;
      if (context.state !== 'running') return false;
      // One bell covers an incoming burst; do not put dozens ahead of a receipt.
      if (kind === 'order' && this.lastKind === 'order' && this.nextAt > context.currentTime)
        return true;
      const start = Math.max(context.currentTime + 0.02, this.nextAt);
      this.lastKind = kind;
      this.nextAt =
        start +
        scheduleStaffSound(context, kind, start, (node) => {
          this.nodes.add(node);
          node.addEventListener('ended', () => this.nodes.delete(node), { once: true });
        });
      return true;
    } catch {
      return generation !== this.generation || context !== this.context;
    }
  }
  dispose() {
    this.disable();
    const context = this.context;
    this.context = null;
    void context?.close().catch(() => {});
  }
}
