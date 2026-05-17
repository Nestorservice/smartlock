/**
 * @file ShakeService.js
 * @description AegisLock — Accelerometer-Based Shake Detection Service
 *
 * Monitors device accelerometer data via `react-native-sensors` to detect
 * deliberate shake gestures. Implements a multi-stage filtering pipeline
 * to reject ambient motion, accidental bumps, and device repositioning.
 *
 * Detection Pipeline:
 *   1. Magnitude filter — rejects low-energy motion below 22 m/s²
 *   2. Cadence filter — enforces 400–1500ms between valid shakes
 *   3. Inactivity timeout — resets counter after 3000ms of no activity
 */

import { accelerometer } from 'react-native-sensors';

// ─── DETECTION THRESHOLDS ─────────────────────────────────────────────────────

/**
 * Minimum acceleration magnitude (m/s²) required to register as a shake.
 * Value of 22 is calibrated to reject:
 *   - Normal walking (~10 m/s²)
 *   - Picking up the phone (~12–15 m/s²)
 *   - Casual hand movement (~8–12 m/s²)
 * Only deliberate, forceful shaking exceeds this threshold.
 */
const MAGNITUDE_THRESHOLD = 22;

/**
 * Minimum time (ms) between consecutive valid shakes.
 * Prevents counting a single shake motion as multiple events.
 * A real shake takes ~200ms for the full motion, so 400ms ensures
 * we only count complete distinct shake cycles.
 */
const MIN_CADENCE_MS = 400;

/**
 * Maximum time (ms) allowed between consecutive valid shakes.
 * If more than 1500ms passes between shakes, the user has likely
 * paused or stopped — the next shake starts a fresh evaluation.
 */
const MAX_CADENCE_MS = 1500;

/**
 * Inactivity timeout (ms) — if no valid shake is detected within
 * this window, the accumulated shake counter resets to zero.
 * This prevents accumulating shakes across disconnected time periods.
 */
const INACTIVITY_TIMEOUT_MS = 3000;

// ─── MODULE STATE ─────────────────────────────────────────────────────────────

/** Active subscription handle — null when detection is stopped */
let subscription = null;

/** Timestamp of the last valid shake event */
let lastShakeTimestamp = 0;

/** Inactivity timer handle — resets shake counter on expiry */
let inactivityTimer = null;

/** Accumulated count of valid shake events in the current sequence */
let shakeCount = 0;

// ─── SERVICE FUNCTIONS ────────────────────────────────────────────────────────

/**
 * Starts the shake detection pipeline.
 *
 * Subscribes to the device accelerometer at the configured interval and
 * applies the three-stage filter pipeline to each reading. When a valid
 * shake is detected, the provided callback is invoked with the current
 * cumulative shake count.
 *
 * @param {function(number): void} onShakeDetected - Callback fired on each
 *   valid shake detection. Receives the current cumulative shake count.
 *   Example: (count) => console.log(`Shake #${count}`)
 */
export function startShakeDetection(onShakeDetected) {
  // Prevent duplicate subscriptions — stop any existing detection first
  if (subscription) {
    console.warn('[ShakeService] Detection already active, restarting...');
    stopShakeDetection();
  }

  // Reset all state for a clean detection session
  shakeCount = 0;
  lastShakeTimestamp = 0;
  inactivityTimer = null;

  console.log('[ShakeService] Starting shake detection pipeline');
  console.log(
    `[ShakeService] Thresholds: magnitude=${MAGNITUDE_THRESHOLD} m/s², ` +
    `cadence=${MIN_CADENCE_MS}-${MAX_CADENCE_MS}ms, timeout=${INACTIVITY_TIMEOUT_MS}ms`,
  );

  // Subscribe to accelerometer data stream at ~50ms polling rate
  subscription = accelerometer.subscribe(
    ({ x, y, z }) => {
      // ── STAGE 1: MAGNITUDE FILTER ──────────────────────────────────
      // Calculate the Euclidean magnitude of the acceleration vector.
      // This gives us a single scalar value representing the total
      // acceleration force regardless of direction.
      const magnitude = Math.sqrt(x * x + y * y + z * z);

      // Reject readings below the magnitude threshold — these represent
      // ambient motion (gravity, walking, gentle handling)
      if (magnitude < MAGNITUDE_THRESHOLD) {
        return; // Not a shake — ignore this reading
      }

      // ── STAGE 2: CADENCE FILTER ────────────────────────────────────
      const now = Date.now();
      const timeSinceLastShake = now - lastShakeTimestamp;

      // Reject if the shake came too quickly after the previous one.
      // This filters out the secondary oscillations of a single shake
      // motion being read as multiple events.
      if (lastShakeTimestamp > 0 && timeSinceLastShake < MIN_CADENCE_MS) {
        return; // Too fast — likely same shake motion, ignore
      }

      // BUG FIX: gap > MAX_CADENCE_MS means a new sequence — reset the counter
      if (lastShakeTimestamp > 0 && timeSinceLastShake > MAX_CADENCE_MS) {
        console.log('[ShakeService] Cadence gap exceeded — resetting counter for new sequence');
        shakeCount = 0;
      }

      // ── STAGE 3: INACTIVITY TIMEOUT MANAGEMENT ─────────────────────
      // Clear any existing inactivity timer since we have a valid shake
      if (inactivityTimer) {
        clearTimeout(inactivityTimer);
        inactivityTimer = null;
      }

      // Start a new inactivity timer. If no shake arrives within the
      // timeout window, the counter resets to zero — preventing
      // accumulation of shakes across disconnected time periods.
      inactivityTimer = setTimeout(() => {
        console.log('[ShakeService] Inactivity timeout reached, resetting counter');
        shakeCount = 0;
        // Notify callback of the reset so UI can update
        if (onShakeDetected) {
          onShakeDetected(shakeCount);
        }
      }, INACTIVITY_TIMEOUT_MS);

      // ── VALID SHAKE: UPDATE STATE AND NOTIFY ───────────────────────
      lastShakeTimestamp = now;
      shakeCount += 1;

      console.log(
        `[ShakeService] Valid shake #${shakeCount} detected ` +
        `(magnitude: ${magnitude.toFixed(1)} m/s², interval: ${timeSinceLastShake}ms)`,
      );

      // Invoke the callback with the updated shake count
      if (onShakeDetected) {
        onShakeDetected(shakeCount);
      }
    },
    (error) => {
      console.error('[ShakeService] Accelerometer error:', error);
    },
  );
}

/**
 * Stops the shake detection pipeline and cleans up all resources.
 *
 * Unsubscribes from the accelerometer stream, clears the inactivity
 * timer, and resets all internal counters to their initial state.
 */
export function stopShakeDetection() {
  console.log('[ShakeService] Stopping shake detection');

  // Unsubscribe from the accelerometer data stream
  if (subscription) {
    subscription.unsubscribe();
    subscription = null;
  }

  // Clear any pending inactivity timer
  if (inactivityTimer) {
    clearTimeout(inactivityTimer);
    inactivityTimer = null;
  }

  // Reset all counters for the next detection session
  shakeCount = 0;
  lastShakeTimestamp = 0;
}
