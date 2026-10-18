/**
 * On photo backdrops the camera can't move without distorting the photo, so
 * the car turns on the spot instead. Written by pointer handlers and frame
 * callbacks only, never during render.
 */
export const turntable = {
  /** Car heading, radians. */
  yaw: 0,
  /** Spin left over from a drag, radians per second; fades after release. */
  fling: 0,
  dragging: false,
  /** Lens zoom: 1 is the showcase framing, below 1 is closer. */
  zoom: 1,
};
