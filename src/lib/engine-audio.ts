/*
 * Onboard audio, synthesised in the browser (no recordings): the 2013 cars'
 * 2.4-litre V8, revving to 18,000, as heard trackside.
 *
 * Two halves. The drivetrain model (shared with the HUD, so the gear and the
 * shift lights match what you hear) turns the car's speed into what the
 * engine is doing — eight gears, revs climbing to the shift point, an
 * ignition cut and a drop in pitch on every upshift, throttle blips on the
 * way down, a lumpy idle — plus pops on the overrun when the driver lifts.
 * And a synth voices it: a harmonic-rich pulse at the V8's firing frequency
 * (four pulses per revolution), a half-order rumble, exhaust rasp, an exhaust
 * resonance that tracks the revs, wind and road noise, and a little open-air
 * reverb. The scene feeds it where the car is relative to the camera, so it
 * gets louder and brighter as the car comes close, pans across the screen,
 * and drops in pitch as it pulls away (Doppler).
 *
 * The model runs on its own 25 ms clock, so it stays responsive even when the
 * 3D scene isn't drawing. Opt-in from the broadcast bar; the audio context is
 * only created by that click, as browsers require.
 */

import { createDrivetrain, revs, stepDrivetrain } from "./drivetrain";

/** Written by the 3D scene each frame it draws; read by the engine's own clock. */
export const engineInput = {
  /** Speed shown on the HUD, km/h. */
  kmh: 0,
  /** 1 while the lap is on screen and the car isn't parked behind the coverage; the engine fades with it. */
  present: 0,
  /** Camera to car, metres at full scale. */
  distance: 12,
  /** How fast the car is closing on the camera, m/s (negative going away). */
  closing: 0,
  /** Where the car is across the screen, -1 (left) to 1 (right). */
  pan: 0,
};

type Engine = { ctx: AudioContext; master: GainNode; tick: () => void; chirp: () => void };

let engine: Engine | null = null;
let wanted = false;
let suspendTimer = 0;
let clock = 0;

const VOLUME = 0.3;
const SPEED_OF_SOUND = 343;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function noiseBuffer(ctx: BaseAudioContext, seconds: number, channels = 1) {
  const buffer = ctx.createBuffer(channels, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  for (let c = 0; c < channels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

/** A short, bright open-air reverb: decaying stereo noise. */
function reverbImpulse(ctx: BaseAudioContext) {
  const seconds = 1.1;
  const buffer = ctx.createBuffer(2, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i++) {
      const t = i / data.length;
      data[i] = (Math.random() * 2 - 1) * (1 - t) ** 3.2 * (t < 0.01 ? t / 0.01 : 1);
    }
  }
  return buffer;
}

/** The engine's pulse: many harmonics, falling off slowly, with the 2nd–4th orders pushed (that's the scream). */
function pulseWave(ctx: BaseAudioContext) {
  const n = 40;
  const real = new Float32Array(n);
  const imag = new Float32Array(n);
  for (let k = 1; k < n; k++) {
    const bump = 1 + 0.9 * Math.exp(-((k - 3) ** 2) / 3);
    imag[k] = (bump / k ** 0.85) * (k % 2 ? 1 : 0.75);
  }
  return ctx.createPeriodicWave(real, imag);
}

function softClip(k: number) {
  const curve = new Float32Array(2048);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return curve;
}

function build(): Engine {
  const ctx = new AudioContext({ latencyHint: "interactive" });
  const master = ctx.createGain();
  master.gain.value = 0;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.knee.value = 6;
  limiter.ratio.value = 8;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.12;
  master.connect(limiter).connect(ctx.destination);

  // The car's own sound goes through one bus: distance, Doppler and pan apply to all of it.
  const carBus = ctx.createGain();
  const panner = ctx.createStereoPanner();
  const dry = ctx.createGain();
  dry.gain.value = 0.85;
  const verb = ctx.createConvolver();
  verb.buffer = reverbImpulse(ctx);
  const wet = ctx.createGain();
  wet.gain.value = 0.22;
  carBus.connect(panner);
  panner.connect(dry).connect(master);
  panner.connect(verb).connect(wet).connect(master);

  // Engine voice: firing-frequency pulse plus a half-order rumble, driven hard, then shaped.
  const pulse = ctx.createOscillator();
  pulse.setPeriodicWave(pulseWave(ctx));
  const half = ctx.createOscillator();
  half.type = "sawtooth";
  const pulseGain = ctx.createGain();
  pulseGain.gain.value = 0.55;
  const halfGain = ctx.createGain();
  halfGain.gain.value = 0.22;
  const drive = ctx.createGain();
  drive.gain.value = 1.6;
  const shaper = ctx.createWaveShaper();
  shaper.curve = softClip(2.2);
  shaper.oversample = "2x";
  // The exhaust resonance rides with the revs; the low-pass opens with throttle.
  const resonance = ctx.createBiquadFilter();
  resonance.type = "peaking";
  resonance.Q.value = 1.6;
  resonance.gain.value = 7;
  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.Q.value = 0.7;
  const engineGain = ctx.createGain();
  engineGain.gain.value = 0;
  pulse.connect(pulseGain).connect(drive);
  half.connect(halfGain).connect(drive);
  drive.connect(shaper).connect(resonance).connect(tone).connect(engineGain).connect(carBus);

  // Combustion roughness: a little jitter on the pitch, faster with the revs.
  const jitter = ctx.createBufferSource();
  jitter.buffer = noiseBuffer(ctx, 2);
  jitter.loop = true;
  const jitterFilter = ctx.createBiquadFilter();
  jitterFilter.type = "lowpass";
  jitterFilter.frequency.value = 60;
  const jitterDepth = ctx.createGain();
  jitterDepth.gain.value = 140;
  jitter.connect(jitterFilter).connect(jitterDepth);
  jitterDepth.connect(pulse.detune);
  jitterDepth.connect(half.detune);

  // Exhaust rasp: noise in a band around the second firing order, with the throttle.
  const noise = noiseBuffer(ctx, 3);
  const rasp = ctx.createBufferSource();
  rasp.buffer = noise;
  rasp.loop = true;
  const raspBand = ctx.createBiquadFilter();
  raspBand.type = "bandpass";
  raspBand.Q.value = 2.2;
  const raspGain = ctx.createGain();
  raspGain.gain.value = 0;
  rasp.connect(raspBand).connect(raspGain).connect(carBus);

  // Overrun pops: short bursts through their own band.
  const popBand = ctx.createBiquadFilter();
  popBand.type = "bandpass";
  popBand.frequency.value = 950;
  popBand.Q.value = 1.1;
  popBand.connect(carBus);

  // Wind and road: low, broadband, with speed. Not panned: it's what the camera hears.
  const wind = ctx.createBufferSource();
  wind.buffer = noise;
  wind.loop = true;
  wind.playbackRate.value = 0.7;
  const windTone = ctx.createBiquadFilter();
  windTone.type = "lowpass";
  const windGain = ctx.createGain();
  windGain.gain.value = 0;
  wind.connect(windTone).connect(windGain).connect(master);

  // Team radio.
  const radioBand = ctx.createBiquadFilter();
  radioBand.type = "bandpass";
  radioBand.frequency.value = 1800;
  radioBand.Q.value = 1.4;
  const radioGain = ctx.createGain();
  radioGain.gain.value = 0.9;
  radioBand.connect(radioGain).connect(master);

  for (const src of [pulse, half, jitter, rasp, wind]) src.start();

  // ---------- The drivetrain ----------
  const m = createDrivetrain();
  const heard = { lastTime: ctx.currentTime, nextPop: 0, closing: 0 };

  const pop = (t: number, strength: number) => {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const g = ctx.createGain();
    const len = 0.012 + Math.random() * 0.03;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(strength, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    src.connect(g).connect(popBand);
    src.start(t, Math.random() * 2, len + 0.02);
  };

  const tick = () => {
    const now = ctx.currentTime;
    const dt = clamp(now - heard.lastTime, 0.005, 0.1);
    heard.lastTime = now;
    const gearBefore = m.gear;
    stepDrivetrain(m, engineInput.kmh, dt, now);
    const rev = revs(m);
    const upshift = m.gear > gearBefore && gearBefore > 0;
    // A downshift's blip opens the throttle for a moment.
    const foot = now < m.blipUntil ? Math.max(m.throttle, 0.85) : m.throttle;

    // Where we hear it from: louder close up, darker far away, higher coming at us.
    const present = clamp(engineInput.present, 0, 1);
    const distance = Math.max(4, engineInput.distance);
    const near = clamp(14 / distance, 0.2, 1.4);
    heard.closing += (clamp(engineInput.closing, -90, 90) - heard.closing) * (1 - Math.exp(-dt * 10));
    const doppler = SPEED_OF_SOUND / (SPEED_OF_SOUND - heard.closing);

    const firing = (m.rpm / 15) * doppler;
    const at = (v: AudioParam, value: number, smooth = 0.012) => v.setTargetAtTime(value, now, smooth);
    at(pulse.frequency, firing, 0.006);
    at(half.frequency, firing / 2, 0.006);
    at(resonance.frequency, firing * 1.6);
    at(raspBand.frequency, clamp(firing * 2.1, 300, 9000));
    at(jitterDepth.gain, 60 + 160 * (1 - rev));
    at(tone.frequency, (900 + 2400 * rev + 5200 * foot * (0.4 + rev)) * clamp(near, 0.45, 1));

    const cut = now < m.cutUntil ? 0.18 : 1;
    const load = 0.32 + 0.68 * foot;
    const loud = (0.22 + 0.78 * rev ** 0.8) * load * cut;
    at(engineGain.gain, loud * near * present, cut < 1 ? 0.004 : 0.02);
    at(raspGain.gain, (0.05 + 0.35 * foot * rev) * near * present * cut);
    at(panner.pan, clamp(engineInput.pan, -1, 1) * 0.75, 0.03);

    const air = clamp(m.kmh / 330, 0, 1);
    at(windGain.gain, air * air * 0.22 * present, 0.06);
    at(windTone.frequency, 250 + m.kmh * 9, 0.08);

    // The crack of an upshift, and the exhaust crackling on the overrun when the driver lifts.
    if (present > 0.1 && upshift) pop(now + 0.003, (0.45 + Math.random() * 0.3) * near);
    if (present > 0.1 && foot < 0.15 && m.rpm > 8500 && now > heard.nextPop) {
      pop(now + 0.005, (0.35 + Math.random() * 0.5) * near);
      heard.nextPop = now + 0.04 + Math.random() * 0.16;
    }
  };

  const chirp = () => {
    const t = ctx.currentTime + 0.01;
    [
      { f: 1320, at: 0, len: 0.06 },
      { f: 990, at: 0.08, len: 0.08 },
    ].forEach(({ f, at: start, len }) => {
      const osc = ctx.createOscillator();
      osc.type = "square";
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t + start);
      g.gain.linearRampToValueAtTime(0.3, t + start + 0.005);
      g.gain.setValueAtTime(0.3, t + start + len - 0.01);
      g.gain.linearRampToValueAtTime(0, t + start + len);
      osc.connect(g).connect(radioBand);
      osc.start(t + start);
      osc.stop(t + start + len + 0.02);
    });
    const hiss = ctx.createBufferSource();
    hiss.buffer = noise;
    const hg = ctx.createGain();
    hg.gain.setValueAtTime(0.22, t);
    hg.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    hiss.connect(hg).connect(radioBand);
    hiss.start(t, Math.random(), 0.24);
  };

  // Quiet while the tab is in the background.
  document.addEventListener("visibilitychange", () => {
    if (!engine) return;
    if (document.hidden) void engine.ctx.suspend();
    else if (wanted) void engine.ctx.resume();
  });

  return { ctx, master, tick, chirp };
}

/** Turns the onboard audio on or off. Call from a click (the first call creates the audio context). */
export function setAudio(on: boolean) {
  wanted = on;
  window.clearTimeout(suspendTimer);
  window.clearInterval(clock);
  clock = 0;
  if (on) {
    try {
      engine ??= build();
    } catch {
      return false;
    }
    const e = engine;
    void e.ctx.resume();
    e.master.gain.setTargetAtTime(VOLUME, e.ctx.currentTime, 0.25);
    clock = window.setInterval(() => e.tick(), 25);
    return true;
  }
  if (engine) {
    const e = engine;
    e.master.gain.setTargetAtTime(0, e.ctx.currentTime, 0.12);
    suspendTimer = window.setTimeout(() => {
      if (!wanted) void e.ctx.suspend();
    }, 700);
  }
  return false;
}

/** A team-radio blip, when the audio is on (a new caption on the lap). */
export function radioChirp() {
  if (wanted && engine && engine.ctx.state === "running") engine.chirp();
}
