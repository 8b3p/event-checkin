// features/check-in/ui/feedback.ts
/** Short tone + buzz, so door staff never has to look twice at the screen. */

let context: AudioContext | null = null;

function tone(frequency: number, durationMs: number, startOffsetMs = 0): void {
  try {
    context ??= new (window.AudioContext ?? (window as any).webkitAudioContext)();
    if (context.state === "suspended") void context.resume();

    const start = context.currentTime + startOffsetMs / 1000;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = "sine";
    oscillator.frequency.value = frequency;

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.25, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + durationMs / 1000);

    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + durationMs / 1000 + 0.02);
  } catch {
    // Audio is a nicety; a blocked AudioContext must not break scanning.
  }
}

/** Admitted / recorded cleanly. */
export function signalGood(): void {
  tone(880, 90);
  tone(1320, 110, 90);
  navigator.vibrate?.(60);
}

/** Blocked — needs a decision (override or dismiss). */
export function signalStop(): void {
  tone(320, 200);
  navigator.vibrate?.([80, 60, 80]);
}

/** Unknown code. */
export function signalBad(): void {
  tone(200, 320);
  navigator.vibrate?.(300);
}
