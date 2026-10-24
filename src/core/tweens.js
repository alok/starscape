// Named scalars that ease toward their targets. Each frame `step(dt)` moves every value a fraction of the way;
// with reduced motion, or a duration of zero, a value jumps straight to its target.

export class Tweens {
  constructor({ reducedMotion = false, onChange = () => {} } = {}) {
    this.values = new Map();
    this.reducedMotion = reducedMotion;
    this.onChange = onChange;
  }
  /** Ease `name` toward `target` over roughly `seconds`. */
  set(name, target, seconds = 0.9) {
    const t = this.values.get(name) ?? { current: target, target, seconds };
    t.target = target; t.seconds = seconds;
    if (this.reducedMotion || seconds <= 0) t.current = target;
    this.values.set(name, t);
    this.onChange();
  }
  get(name) { return this.values.get(name)?.current ?? 0; }
  target(name) { return this.values.get(name)?.target ?? 0; }
  /** Advance every value; returns true while anything is still moving. */
  step(dt) {
    let moving = false;
    for (const t of this.values.values()) {
      if (t.current === t.target) continue;
      t.current += (t.target - t.current) * (1 - Math.exp((-dt * 5.5) / Math.max(0.05, t.seconds)));
      if (Math.abs(t.target - t.current) < 1e-3) t.current = t.target;
      moving = true;
    }
    return moving;
  }
}
