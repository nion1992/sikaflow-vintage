/**
 * Calculates an integer-ish value that steps from `from`
 * toward `to` over `durationMs` milliseconds using
 * requestAnimationFrame and an ease-out interpolation.
 *
 * Returns the intermediate value at each frame. The caller
 * is responsible for stopping the animation (typically on
 * unmount or when the value changes).
 *
 * `formatter` receives the raw number and returns the
 * displayed string, so currency/grouping are respected.
 */
export function animateNumber(
  from: number,
  to: number,
  durationMs: number,
  formatter: (value: number) => string,
): (deltaTime: number, elapsed: number) => string {
  const startTime = performance.now();

  return (deltaTime: number) => {
    const elapsed = deltaTime - startTime;
    const progress = Math.min(elapsed / durationMs, 1);
    // Ease-out so the tick feels natural and fast at first.
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = from + (to - from) * eased;
    return formatter(current);
  };
}

/**
 * Returns a formatted string for the current step of a count.
 * Call this inside your animation loop.
 */
export function formatMoneyValue(value: number): string {
  // Currency formatting respected from the existing money lib.
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "SZL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}
