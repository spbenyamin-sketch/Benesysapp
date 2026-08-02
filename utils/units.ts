// Quantity behaviour per unit of measure.
//
// A shop counts pieces in whole numbers (you never sell 1.5 boxes), but weighs
// and measures in fractions (1.25 kg, 0.75 ltr, 2.5 mtr). So the +/− stepper on
// the invoice and counter screens must step by a sensible amount for the unit —
// 1 for pieces, a quarter for weight, 50 for grams — and offer the fractions a
// shopkeeper actually says out loud as one-tap presets.

/** Step size for one tap of +/−, keyed by the unit's lowercase name. */
const STEPS: { units: string[]; step: number; presets: number[] }[] = [
  {
    // Weight / volume sold by the fraction.
    units: ['kg', 'kilo', 'kilogram', 'kilograms', 'ltr', 'l', 'litre', 'liter', 'litres', 'liters'],
    step: 0.25,
    presets: [0.25, 0.5, 0.75, 1, 2, 5],
  },
  {
    // Small weights/volumes — counted in fifties, not quarters.
    units: ['g', 'gm', 'gms', 'gram', 'grams', 'ml', 'millilitre', 'milliliter'],
    step: 50,
    presets: [50, 100, 250, 500, 1000],
  },
  {
    // Length / area — halves are normal, quarters are not.
    units: ['mtr', 'm', 'meter', 'metre', 'meters', 'metres', 'ft', 'feet', 'foot', 'cm', 'inch', 'sq ft', 'sqft', 'sq.ft'],
    step: 0.5,
    presets: [0.5, 1, 2, 5, 10],
  },
];

const COUNT_PRESETS = [1, 2, 5, 10];

function entryFor(unit: string) {
  const u = (unit ?? '').trim().toLowerCase();
  return STEPS.find((e) => e.units.includes(u)) ?? null;
}

/** True when this unit is normally sold in fractions (kg, ltr, mtr…). */
export function isFractionalUnit(unit: string): boolean {
  const e = entryFor(unit);
  return !!e && e.step < 1;
}

/** How much one tap of + or − should change the quantity. */
export function qtyStep(unit: string): number {
  return entryFor(unit)?.step ?? 1;
}

/** One-tap quantities offered under the stepper for this unit. */
export function qtyPresets(unit: string): number[] {
  return entryFor(unit)?.presets ?? COUNT_PRESETS;
}

/** Trim float noise: 1.2000000000000002 → 1.2, 3 → 3. */
export function roundQty(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * One tap of +/−. Snaps onto the unit's step grid, so a hand-typed 1.2 kg
 * becomes 1.25 on "+" and 1 on "−" rather than drifting off the grid, and never
 * goes below zero.
 */
export function stepQty(current: number, unit: string, direction: 1 | -1): number {
  const step = qtyStep(unit);
  const eps = 1e-9;
  const grid = current / step;
  const next =
    direction > 0
      ? (Math.floor(grid + eps) + 1) * step
      : (Math.ceil(grid - eps) - 1) * step;
  return Math.max(0, roundQty(next));
}

/** Display a quantity without trailing zeros ("1.5", "2", "0.75"). */
export function formatQtyValue(value: number): string {
  const v = roundQty(value);
  return Number.isInteger(v) ? String(v) : String(v);
}

/** Pretty label for a preset chip: 0.25 → "¼", 0.5 → "½", 0.75 → "¾". */
export function presetLabel(value: number): string {
  if (value === 0.25) return '¼';
  if (value === 0.5) return '½';
  if (value === 0.75) return '¾';
  return formatQtyValue(value);
}
