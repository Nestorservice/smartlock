/**
 * @file GeminiService.js
 * @description AegisLock — AI Formula Translation Service (Groq / Llama 3)
 *
 * Uses Groq's free API (console.groq.com) to convert natural language
 * instructions into mathematical formulas. Groq is used instead of Gemini
 * because it offers a much more generous free tier (30 req/min, 14 400 req/day).
 *
 * The formula uses variable `j` = current day of week (1=Monday, 7=Sunday).
 * On any failure, the service returns { formula: null, error: '<CODE>' }.
 */

import Config from 'react-native-config';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_API_KEY = Config.GROQ_API_KEY;
const GROQ_MODEL   = 'llama-3.3-70b-versatile';

const SYSTEM_PROMPT = `You are a mathematical formula generator. The user will describe a rule in natural language. You must respond with ONLY a raw mathematical formula using the variable "j" where j represents the day of the week as an integer (1 = Monday, 2 = Tuesday, 3 = Wednesday, 4 = Thursday, 5 = Friday, 6 = Saturday, 7 = Sunday). Rules:
- Return ONLY the formula, nothing else.
- No text, no explanation, no punctuation outside the formula.
- Use standard math operators: + - * / ^ % ( )
- % means modulo (remainder). Example: j % 5 gives the remainder of j divided by 5.
- The formula must be evaluable by a standard math parser.
- Examples of valid output: "j * 2 + 1", "j ^ 2 % 5", "j ^ 2 - j + 3", "j + 5", "(j ^ 2) % 5"
- Never return an empty string. If unsure, return "j".`;

const FALLBACK_FORMULA  = 'j';
const REQUEST_TIMEOUT_MS = 15000;

// ─── SERVICE ──────────────────────────────────────────────────────────────────

/**
 * Translates a natural language instruction into a math formula via Groq API.
 *
 * @param {string} userText
 * @returns {Promise<{ formula: string | null, error: string | null }>}
 */
export async function translateInstructionWithGemini(userText) {
  if (!userText || typeof userText !== 'string' || userText.trim().length === 0) {
    console.warn('[AIService] Empty input received');
    return { formula: FALLBACK_FORMULA, error: null };
  }

  const requestBody = {
    model: GROQ_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: `User instruction: ${userText.trim()}` },
    ],
    temperature: 0.1,
    max_tokens:  64,
  };

  try {
    console.log('[AIService] Sending request to Groq — key present:', !!GROQ_API_KEY, 'len:', GROQ_API_KEY ? GROQ_API_KEY.length : 0);

    const data = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', GROQ_API_URL);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader('Authorization', `Bearer ${GROQ_API_KEY}`);
      xhr.timeout = REQUEST_TIMEOUT_MS;

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try { resolve(JSON.parse(xhr.responseText)); }
          catch (e) { reject(new Error('JSON_INVALIDE')); }
        } else {
          console.error('[AIService] HTTP error:', xhr.status, xhr.responseText.substring(0, 200));
          reject(new Error(`HTTP_${xhr.status}`));
        }
      };
      xhr.onerror   = () => reject(new Error('ERREUR_RESEAU'));
      xhr.ontimeout = () => reject(new Error('TIMEOUT'));

      xhr.send(JSON.stringify(requestBody));
    });

    // Groq uses the OpenAI response format: choices[0].message.content
    const rawFormula = data?.choices?.[0]?.message?.content?.trim();

    if (!rawFormula || rawFormula.length === 0) {
      console.warn('[AIService] Empty formula in response');
      return { formula: null, error: 'REPONSE_VIDE' };
    }

    // Allow only valid math characters and 'j' (including % for modulo)
    const formulaPattern = /^[0-9j+\-*/^(). %]+$/;
    if (!formulaPattern.test(rawFormula)) {
      console.warn('[AIService] Invalid characters in formula:', rawFormula);
      return { formula: null, error: 'FORMULE_INVALIDE' };
    }

    console.log('[AIService] Success — formula:', rawFormula);
    return { formula: rawFormula, error: null };

  } catch (error) {
    console.error('[AIService] Error:', error.message);
    return { formula: null, error: error.message };
  }
}
