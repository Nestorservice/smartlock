/**
 * @file MathService.js
 * @description AegisLock — Mathematical Formula Evaluation Service
 *
 * Provides day-of-week computation and safe mathematical expression evaluation.
 * Uses the `expr-eval` library to parse and evaluate formula strings containing
 * the variable `j` (current day of week as integer).
 *
 * Output is guaranteed to be a strictly positive integer — this value
 * determines the required number of shakes to unlock the device.
 */

import { Parser } from 'expr-eval';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

/**
 * Day-of-week mapping: JavaScript Date.getDay() returns 0=Sunday, 1=Monday, etc.
 * AegisLock uses 1=Monday through 7=Sunday, so we remap accordingly.
 */
const JS_DAY_TO_AEGIS_DAY = {
  0: 7, // JavaScript Sunday (0) → AegisLock Sunday (7)
  1: 1, // Monday
  2: 2, // Tuesday
  3: 3, // Wednesday
  4: 4, // Thursday
  5: 5, // Friday
  6: 6, // Saturday
};

/** Minimum allowed result — if evaluation yields 0, return this instead */
const MINIMUM_RESULT = 5;

/** Fallback result when formula parsing fails entirely */
const FALLBACK_RESULT = 5;

// ─── PARSER INSTANCE ──────────────────────────────────────────────────────────

/**
 * Singleton Parser instance from expr-eval.
 * Reused across evaluations to avoid repeated instantiation overhead.
 * The parser safely evaluates mathematical expressions without `eval()`.
 */
const parser = new Parser();

// ─── SERVICE FUNCTIONS ────────────────────────────────────────────────────────

/**
 * Returns the current day of the week as an integer.
 * Uses the AegisLock convention: Monday = 1 through Sunday = 7.
 *
 * @returns {number} Integer from 1 (Monday) to 7 (Sunday).
 */
export function getDayNumber() {
  // Get JavaScript's native day index (0 = Sunday, 6 = Saturday)
  const jsDay = new Date().getDay();

  // Remap to AegisLock's 1-indexed Monday-first convention
  const aegisDay = JS_DAY_TO_AEGIS_DAY[jsDay];

  console.log(
    `[MathService] Current JS day index: ${jsDay} → AegisLock day: ${aegisDay}`,
  );

  return aegisDay;
}

/**
 * Safely evaluates a mathematical formula string using `expr-eval`.
 *
 * The formula may contain the variable `j`, which is substituted with
 * the current day of the week (1–7). The result is forced to a strictly
 * positive integer via Math.abs() and Math.round().
 *
 * @param {string} formulaString - A math expression string.
 *   Example: "j * 2 + 1" → on Wednesday (j=3): 3*2+1 = 7
 * @returns {number} A strictly positive integer (minimum 1, fallback 5).
 *
 * @example
 * // On a Wednesday (j = 3):
 * evaluateFormula('j * 2 + 1'); // Returns 7
 * evaluateFormula('j ^ 2');     // Returns 9
 * evaluateFormula('0');         // Returns 5 (zero is replaced with minimum)
 */
export function evaluateFormula(formulaString) {
  // Step 1: Validate the input string
  if (!formulaString || typeof formulaString !== 'string') {
    console.warn('[MathService] Invalid formula input, returning fallback:', FALLBACK_RESULT);
    return FALLBACK_RESULT;
  }

  // Step 2: Retrieve the current day number for variable substitution
  const dayNumber = getDayNumber();
  console.log(`[MathService] Evaluating formula: "${formulaString}" with j = ${dayNumber}`);

  try {
    // Step 3: Parse the formula string into an expression tree
    // expr-eval creates an AST representation that can be safely evaluated
    // without using JavaScript's dangerous eval() function
    const expression = parser.parse(formulaString);

    // Step 4: Evaluate the expression by substituting `j` with the day number
    // The evaluate() method accepts a variable map { j: <value> }
    const rawResult = expression.evaluate({ j: dayNumber });

    console.log(`[MathService] Raw evaluation result: ${rawResult}`);

    // Step 5: Ensure the result is a finite number
    if (typeof rawResult !== 'number' || !isFinite(rawResult)) {
      console.warn('[MathService] Non-finite result, returning fallback:', FALLBACK_RESULT);
      return FALLBACK_RESULT;
    }

    // Step 6: Force strictly positive integer output
    // Math.abs() removes negative values, Math.round() eliminates decimals
    const positiveResult = Math.round(Math.abs(rawResult));

    // Step 7: Handle the zero edge case — a zero shake count is meaningless
    if (positiveResult === 0) {
      console.log('[MathService] Result was 0, applying minimum:', MINIMUM_RESULT);
      return MINIMUM_RESULT;
    }

    console.log(`[MathService] Final result: ${positiveResult}`);
    return positiveResult;
  } catch (error) {
    // Step 8: Catch any parsing or evaluation errors from malformed formulas
    console.error('[MathService] Formula evaluation error:', error.message);
    console.warn('[MathService] Returning fallback result:', FALLBACK_RESULT);
    return FALLBACK_RESULT;
  }
}
