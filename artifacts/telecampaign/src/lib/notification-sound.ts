let audioContext: AudioContext | null = null;

function getAudioContext() {
  if (typeof window === "undefined") return null;
  const AudioContextConstructor = window.AudioContext
    ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) return null;
  audioContext ??= new AudioContextConstructor();
  return audioContext;
}

export function unlockNotificationSound() {
  const context = getAudioContext();
  if (!context || context.state !== "suspended") return;
  void context.resume();
}

export function playNotificationSound() {
  const context = getAudioContext();
  if (!context) return;

  const play = () => {
    const start = context.currentTime;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.12, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.32);
    gain.connect(context.destination);

    const oscillator = context.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(740, start);
    oscillator.frequency.setValueAtTime(988, start + 0.09);
    oscillator.connect(gain);
    oscillator.start(start);
    oscillator.stop(start + 0.34);
  };

  if (context.state === "suspended") {
    void context.resume().then(play).catch(() => undefined);
    return;
  }
  play();
}