/**
 * Calculates the number of combinations (n choose k).
 */
export function combinations(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  if (k > n / 2) k = n - k;
  let res = 1;
  for (let i = 1; i <= k; i++) {
    res = (res * (n - i + 1)) / i;
  }
  return res;
}

/**
 * Calculates the binomial probability P(X >= k) for n trials and success probability p.
 */
export function getBinomialP(n: number, k: number, p: number): number {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  let total = 0;
  for (let j = k; j <= n; j++) {
    total += combinations(n, j) * Math.pow(p, j) * Math.pow(1 - p, n - j);
  }
  return total;
}

/**
 * Calculates the mathematical expectation for a dice expression with keep/drop modifiers.
 * Supports kh, kl, dh, dl.
 */
export function getDieExpectation(
  count: number,
  faces: number,
  modifier?: string,
  modValue?: number,
): number {
  if (!modifier) return (count * (faces + 1)) / 2;

  let k = modValue ?? 1;
  let highest = true;

  const m = modifier.toLowerCase();
  if (m === "kh") {
    highest = true;
    k = modValue ?? 1;
  } else if (m === "kl") {
    highest = false;
    k = modValue ?? 1;
  } else if (m === "dh") {
    highest = false;
    k = count - (modValue ?? 1);
  } else if (m === "dl") {
    highest = true;
    k = count - (modValue ?? 1);
  } else {
    // Unsupported modifier, fallback to simple average
    return (count * (faces + 1)) / 2;
  }

  // Clamp k to [0, count]
  k = Math.max(0, Math.min(k, count));

  if (k === 0) return 0;
  if (k === count) return (count * (faces + 1)) / 2;

  let totalE = 0;
  if (highest) {
    // Sum of expectations of k highest order statistics
    for (let r = count - k + 1; r <= count; r++) {
      for (let i = 0; i < faces; i++) {
        totalE += 1 - getBinomialP(count, r, i / faces);
      }
    }
  } else {
    // Sum of expectations of k lowest order statistics
    for (let r = 1; r <= k; r++) {
      for (let i = 0; i < faces; i++) {
        totalE += 1 - getBinomialP(count, r, i / faces);
      }
    }
  }

  return totalE;
}
