/** Strip currency symbols and commas, return numeric value. */
export function moneyToNumber(currencyString: string): number {
  const cleaned = currencyString.replace(/[^0-9.-]/g, "");
  return parseFloat(cleaned);
}

/** Format a number back to currency string. */
export function numberToMoney(
  amount: number,
  locale = "en-US",
  currency = "USD",
): string {
  return new Intl.NumberFormat(locale, { currency, style: "currency" }).format(
    amount,
  );
}

/** Assert two currency strings are approximately equal. */
export function assertPricesClose(
  actual: string,
  expected: string,
  precision = 2,
): void {
  const actualNum = moneyToNumber(actual);
  const expectedNum = moneyToNumber(expected);

  if (!Number.isFinite(actualNum) || !Number.isFinite(expectedNum)) {
    throw Error(
      `Invalid price value: ${actual} (${actualNum}) vs ${expected} (${expectedNum})`,
    );
  }

  if (Math.abs(actualNum - expectedNum) > Math.pow(10, -precision)) {
    throw Error(
      `Prices not close: ${actual} (${actualNum}) vs ${expected} (${expectedNum})`,
    );
  }
}
