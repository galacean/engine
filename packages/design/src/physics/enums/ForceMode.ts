/** How a force or torque changes a body's velocity. */
export enum ForceMode {
  /** Force or torque multiplied by the timestep and divided by the mass or inertia. */
  Force = 0,
  /** Impulse divided by the mass or inertia. */
  Impulse = 1,
  /** One-time change to velocity or angular velocity. */
  VelocityChange = 2,
  /** Acceleration multiplied by the timestep. */
  Acceleration = 3
}
