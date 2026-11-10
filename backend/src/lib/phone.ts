/**
 * Normalize a Lebanese phone number to +961XXXXXXX(X).
 * Accepts: 03123456, 3123456, 71123456, +9613123456, 009613123456, 961 3 123 456.
 * Returns null when the input is not a plausible Lebanese number.
 */
export function normalizeLebanesePhone(input: string): string | null {
  let d = input.replace(/[\s\-().]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  if (d.startsWith('00')) d = d.slice(2);
  if (!/^\d+$/.test(d)) return null;
  if (d.startsWith('961')) d = d.slice(3);
  if (d.startsWith('0')) d = d.slice(1);
  // Lebanese numbers: mobiles 3xxxxxx (7 digits) or 70/71/76/78/79/81xxxxxx (8 digits); landlines 1/4/5/6/7/8/9 + 6 digits
  if (!/^\d{7,8}$/.test(d)) return null;
  return `+961${d}`;
}
