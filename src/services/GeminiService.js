/**
 * @file GeminiService.js
 * @description AegisLock — Gemini AI Formula Translation Service
 *
 * Communicates with Google's Gemini Pro API to convert natural language
 * security instructions into mathematical formulas. The formula uses
 * variable `j` representing the current day of the week (1=Monday, 7=Sunday).
 *
 * On any failure (network, API, parsing), the service degrades gracefully
 * by returning the identity formula 'j'.
 */

import Config from 'react-native-config';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

// BUG FIX: gemini-pro is deprecated — use gemini-1.5-flash
const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

// API key loaded from .env via react-native-config (never hardcoded)
const GEMINI_API_KEY = Config.GEMINI_API_KEY;

/**
 * System-level prompt that constrains the model output to ONLY a raw
 * mathematical formula. This prevents any conversational text, markdown,
 * or punctuation from contaminating the formula string.
 */
const SYSTEM_PROMPT = `You are a mathematical formula generator. The user will describe a rule in natural language. You must respond with ONLY a raw mathematical formula using the variable "j" where j represents the day of the week as an integer (1 = Monday, 2 = Tuesday, 3 = Wednesday, 4 = Thursday, 5 = Friday, 6 = Saturday, 7 = Sunday). Rules:
- Return ONLY the formula, nothing else.
- No text, no explanation, no punctuation outside the formula.
- Use standard math operators: + - * / ^ ( )
- The formula must be evaluable by a standard math parser.
- Examples of valid output: "j * 2 + 1", "j ^ 2 - j + 3", "j + 5"
- Never return an empty string. If unsure, return "j".`;

/** Fallback formula returned when the API call fails for any reason */
const FALLBACK_FORMULA = 'j';

/** Network request timeout in milliseconds — 15 seconds */
const REQUEST_TIMEOUT_MS = 15000;

// ─── SERVICE ──────────────────────────────────────────────────────────────────

/**
 * Translates a natural language instruction into a mathematical formula
 * via the Gemini Pro API.
 *
 * @param {string} userText - The natural language instruction from the user.
 *   Example: "The number of shakes should be twice the day plus three"
 * @returns {Promise<string>} A raw math formula string using variable `j`.
 *   Example: "j * 2 + 3"
 *   Returns 'j' on any failure.
 */
export async function translateInstructionWithGemini(userText) {
  // Step 1: Validate input — reject empty or whitespace-only strings
  if (!userText || typeof userText !== 'string' || userText.trim().length === 0) {
    console.warn('[GeminiService] Empty input received, returning fallback formula');
    return FALLBACK_FORMULA;
  }

  // Step 2: Construct the request payload with system prompt and user content
  const requestBody = {
    contents: [
      {
        // The system prompt constrains the model to output only a formula
        parts: [
          { text: SYSTEM_PROMPT },
          { text: `User instruction: ${userText.trim()}` },
        ],
      },
    ],
    // Generation config to minimize creative/random output
    generationConfig: {
      temperature: 0.1, // Near-deterministic output
      topP: 0.8,
      topK: 10,
      maxOutputTokens: 64, // Formulas are short — cap output length
    },
  };

  // Step 3: Create an AbortController for request timeout enforcement
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    // Abort the fetch if it exceeds the timeout threshold
    controller.abort();
    console.warn('[GeminiService] Request timed out after', REQUEST_TIMEOUT_MS, 'ms');
  }, REQUEST_TIMEOUT_MS);

  try {
    // Step 4: Execute the POST request to Gemini API
    console.log('[GeminiService] Sending translation request to Gemini Pro...');
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal, // Attach timeout abort signal
    });

    // Step 5: Clear the timeout since the response arrived
    clearTimeout(timeoutId);

    // Step 6: Validate HTTP response status
    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        '[GeminiService] API returned non-OK status:',
        response.status,
        errorText,
      );
      return FALLBACK_FORMULA;
    }

    // Step 7: Parse the JSON response body
    const data = await response.json();

    // Step 8: Extract the formula text from the nested response structure
    // Gemini returns: { candidates: [{ content: { parts: [{ text: "..." }] } }] }
    const candidates = data?.candidates;
    if (!candidates || candidates.length === 0) {
      console.warn('[GeminiService] No candidates in API response');
      return FALLBACK_FORMULA;
    }

    const parts = candidates[0]?.content?.parts;
    if (!parts || parts.length === 0) {
      console.warn('[GeminiService] No parts in candidate response');
      return FALLBACK_FORMULA;
    }

    // Step 9: Clean the extracted formula — strip whitespace and newlines
    const rawFormula = parts[0]?.text?.trim();
    if (!rawFormula || rawFormula.length === 0) {
      console.warn('[GeminiService] Empty formula text in response');
      return FALLBACK_FORMULA;
    }

    // Step 10: Basic validation — formula should only contain math characters and 'j'
    // Allow: digits, j, operators, parentheses, spaces, decimal points, caret
    const formulaPattern = /^[0-9j+\-*/^(). ]+$/;
    if (!formulaPattern.test(rawFormula)) {
      console.warn(
        '[GeminiService] Formula contains invalid characters:',
        rawFormula,
      );
      // Attempt to extract a valid portion, else fallback
      return FALLBACK_FORMULA;
    }

    console.log('[GeminiService] Successfully translated formula:', rawFormula);
    return rawFormula;
  } catch (error) {
    // Step 11: Handle network failures, timeouts, and unexpected errors
    clearTimeout(timeoutId);

    if (error.name === 'AbortError') {
      console.error('[GeminiService] Request aborted due to timeout');
    } else {
      console.error('[GeminiService] Network or parsing error:', error.message);
    }

    // Always degrade gracefully — return the identity formula
    return FALLBACK_FORMULA;
  }
}
