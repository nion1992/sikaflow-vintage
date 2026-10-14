import { formatMoneyValue } from "@/lib/animate-number";

/**
 * Returns the target value formatted immediately.
 * All animations were removed app-wide, so no counting
 * interpolation runs. The signature (including `from`
 * and `duration`) is preserved for existing callers.
 */
export function useCountUp({
  value,
  formatter = formatMoneyValue,
}: {
  value: number;
  from?: number;
  formatter?: (value: number) => string;
  duration?: number;
}): string {
  return formatter(value);
}
