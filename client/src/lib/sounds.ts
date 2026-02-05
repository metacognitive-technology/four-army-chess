type AttackSoundType = 'arrow' | 'axe' | 'bomb' | 'pawn' | 'wallbuild';

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
}

function playTone(
  frequency: number,
  duration: number,
  type: OscillatorType = 'sine',
  volume: number = 0.3,
  frequencyEnd?: number
) {
  const ctx = getAudioContext();
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();
  
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);
  if (frequencyEnd) {
    oscillator.frequency.exponentialRampToValueAtTime(frequencyEnd, ctx.currentTime + duration);
  }
  
  gainNode.gain.setValueAtTime(volume, ctx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
  
  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);
  
  oscillator.start(ctx.currentTime);
  oscillator.stop(ctx.currentTime + duration);
}

function playNoise(duration: number, volume: number = 0.2) {
  const ctx = getAudioContext();
  const bufferSize = ctx.sampleRate * duration;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  
  const gainNode = ctx.createGain();
  gainNode.gain.setValueAtTime(volume, ctx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
  
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(1000, ctx.currentTime);
  
  noise.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(ctx.destination);
  
  noise.start(ctx.currentTime);
  noise.stop(ctx.currentTime + duration);
}

export function playArrowSound() {
  playTone(800, 0.15, 'sine', 0.2, 400);
  setTimeout(() => playTone(600, 0.1, 'sine', 0.15, 300), 50);
}

export function playAxeSound() {
  playTone(200, 0.2, 'sawtooth', 0.25, 100);
  setTimeout(() => playTone(150, 0.15, 'square', 0.2, 80), 100);
}

export function playBombSound() {
  playNoise(0.4, 0.3);
  playTone(100, 0.3, 'sine', 0.4, 30);
  setTimeout(() => playTone(60, 0.2, 'sine', 0.3, 20), 100);
}

export function playPawnSound() {
  playTone(400, 0.1, 'square', 0.2, 600);
  setTimeout(() => playTone(500, 0.08, 'square', 0.15, 300), 50);
}

export function playWallBuildSound() {
  // 3 "kerchunk" sounds for wall building
  const kerchunk = (delay: number) => {
    setTimeout(() => {
      playTone(120, 0.08, 'square', 0.3, 80);
      playNoise(0.06, 0.15);
    }, delay);
  };
  kerchunk(0);
  kerchunk(120);
  kerchunk(240);
}

export function playAttackSound(type: AttackSoundType) {
  switch (type) {
    case 'arrow':
      playArrowSound();
      break;
    case 'axe':
      playAxeSound();
      break;
    case 'bomb':
      playBombSound();
      break;
    case 'pawn':
      playPawnSound();
      break;
    case 'wallbuild':
      playWallBuildSound();
      break;
  }
}

export function playSuccessSound() {
  playTone(523, 0.1, 'sine', 0.2);
  setTimeout(() => playTone(659, 0.1, 'sine', 0.2), 100);
  setTimeout(() => playTone(784, 0.15, 'sine', 0.25), 200);
}

export function playFailSound() {
  playTone(300, 0.15, 'sawtooth', 0.2, 200);
  setTimeout(() => playTone(200, 0.2, 'sawtooth', 0.15, 100), 100);
}

export function playVictoryFanfare() {
  // Triumphant fanfare
  playTone(523, 0.15, 'square', 0.25); // C5
  setTimeout(() => playTone(659, 0.15, 'square', 0.25), 150); // E5
  setTimeout(() => playTone(784, 0.15, 'square', 0.25), 300); // G5
  setTimeout(() => playTone(1047, 0.3, 'square', 0.3), 450); // C6
  setTimeout(() => {
    playTone(784, 0.1, 'square', 0.2); // G5
    playTone(1047, 0.4, 'sine', 0.35); // C6 sustained
  }, 600);
  setTimeout(() => playTone(1319, 0.5, 'sine', 0.3), 800); // E6 finale
}

export function playDefeatSound() {
  // Sad trombone "wah wah wah wahhh"
  playTone(311, 0.3, 'sawtooth', 0.3, 293); // Eb4 -> D4
  setTimeout(() => playTone(293, 0.3, 'sawtooth', 0.28, 277), 350); // D4 -> Db4
  setTimeout(() => playTone(277, 0.3, 'sawtooth', 0.26, 261), 700); // Db4 -> C4
  setTimeout(() => playTone(261, 0.6, 'sawtooth', 0.3, 195), 1050); // C4 -> G3 (long slide down)
}
