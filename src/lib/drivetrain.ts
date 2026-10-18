/*
 * The lap car's drivetrain: a small model shared by the onboard HUD and the
 * engine sound, so the gear and the shift lights on screen match what you
 * hear. It turns road speed into what the 2013 cars' 2.4-litre V8 is doing:
 * eight gears, revs climbing to the shift point, a 40 ms ignition cut and a
 * drop onto the next ratio on every upshift, a throttle blip on every
 * downshift, clutch slip pulling away, and a lumpy idle when stopped. The
 * pedals are read off the car's acceleration.
 */

export const IDLE_RPM = 4300;
export const LIMIT_RPM = 18000;
const UPSHIFT_RPM = 17400;
const DOWNSHIFT_RPM = 10800;
/** The shift lights start to light at these revs and are full at the shift point. */
const LIGHTS_RPM = 10000;
/** Engine revs per km/h in each gear: tops of about 95, 140, 180, 215, 250, 280 and 305 km/h, then 330 at 18,000 in eighth. */
const GEARS = [183.2, 124.3, 96.7, 80.9, 69.6, 62.1, 57, 54.5];

export type Drivetrain = {
  /** 0 is neutral. */
  gear: number;
  rpm: number;
  /** Pedals, 0 to 1. */
  throttle: number;
  brake: number;
  /** km/h per second, smoothed. */
  accel: number;
  /** Speed at the last step, km/h. */
  kmh: number;
  /** The ignition is cut for an upshift until this time, s. */
  cutUntil: number;
  /** A downshift's throttle blip lasts until this time, s. */
  blipUntil: number;
  /** The idle's wander, rpm. */
  burble: number;
};

export const createDrivetrain = (): Drivetrain => ({
  gear: 0,
  rpm: IDLE_RPM,
  throttle: 0,
  brake: 0,
  accel: 0,
  kmh: 0,
  cutUntil: 0,
  blipUntil: 0,
  burble: 0,
});

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Moves the model on by `dt` seconds to time `now` (s, any clock), with the car at `kmh`. */
export function stepDrivetrain(m: Drivetrain, kmh: number, dt: number, now: number) {
  const step = Math.max(1e-3, dt);
  const ease = (rate: number) => 1 - Math.exp(-step * rate);
  const speed = Math.max(0, kmh);
  m.accel += ((speed - m.kmh) / step - m.accel) * ease(14);
  m.kmh = speed;

  let target: number;
  if (speed < 2) {
    // Stopped: neutral, clutch in, idling a little unevenly, as these engines do.
    m.gear = 0;
    m.burble = m.burble * Math.exp(-step * 5) + (Math.random() - 0.5) * 1400 * Math.sqrt(step);
    target = IDLE_RPM + m.burble;
  } else {
    if (m.gear === 0) m.gear = 1;
    target = speed * GEARS[m.gear - 1];
    if (target > UPSHIFT_RPM && m.gear < GEARS.length && m.accel > 0) {
      // Upshift: the ignition cuts for 40 ms and the revs drop straight onto the next ratio.
      m.gear++;
      m.cutUntil = now + 0.04;
      target = speed * GEARS[m.gear - 1];
      m.rpm = target;
    } else if (target < DOWNSHIFT_RPM && m.gear > 1 && m.accel < 0) {
      // Downshift on the brakes, with a quick blip of throttle to match the revs.
      m.gear--;
      m.blipUntil = now + 0.05;
      target = speed * GEARS[m.gear - 1];
    }
    // Pulling away in first, the clutch slips: the revs run ahead of the speed.
    if (m.gear === 1 && m.accel > 0) target = Math.max(target, 10500 + speed * 55);
    if (now < m.blipUntil) target += 2500;
    target = clamp(target, IDLE_RPM, LIMIT_RPM);
  }
  m.rpm += (target - m.rpm) * ease(28);

  // Flat out while gaining speed, off and on the brakes while losing it, a whiff to hold a speed.
  const blip = now < m.blipUntil;
  const throttle = blip ? 0.6 : m.accel > 12 ? 1 : m.accel < -12 ? 0 : speed >= 2 ? 0.3 : 0;
  const brake = m.accel < -12 ? Math.min(1, -m.accel / 180) : 0;
  m.throttle += (throttle - m.throttle) * ease(25);
  m.brake += (brake - m.brake) * ease(20);
  return m;
}

/** Revs as a share of the range, idle to the limiter. */
export const revs = (m: Drivetrain) => clamp((m.rpm - IDLE_RPM) / (LIMIT_RPM - IDLE_RPM), 0, 1);

/** The steering wheel's shift lights, 0 to 1: they fill from 10,000 rpm and are full at the shift point. */
export const shiftLights = (m: Drivetrain) => clamp((m.rpm - LIGHTS_RPM) / (UPSHIFT_RPM - LIGHTS_RPM), 0, 1);
