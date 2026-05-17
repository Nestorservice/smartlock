/**
 * @file SecurityService.js
 * @description AegisLock — Intrusion Detection & Alert Service
 *
 * Pipeline déclenché quand le nombre maximum de tentatives est dépassé :
 *   1. Lire l'email configuré depuis AsyncStorage
 *   2. Capturer une photo depuis la caméra frontale
 *   3. Récupérer les coordonnées GPS
 *   4. Envoyer l'alerte via EmailJS (REST API, sans backend)
 *
 * EmailJS : https://www.emailjs.com — compte gratuit = 200 emails/mois.
 * Configurer les variables dans .env :
 *   EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, EMAILJS_PUBLIC_KEY
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import Geolocation from '@react-native-community/geolocation';
import Config from 'react-native-config';
import { PermissionsAndroid, Platform } from 'react-native';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const EMAILJS_API_URL = 'https://api.emailjs.com/api/v1.0/email/send';

// Lus depuis .env — ne jamais écrire ces valeurs en dur
const EMAILJS_SERVICE_ID  = Config.EMAILJS_SERVICE_ID;
const EMAILJS_TEMPLATE_ID = Config.EMAILJS_TEMPLATE_ID;
const EMAILJS_PUBLIC_KEY  = Config.EMAILJS_PUBLIC_KEY;

const STORAGE_KEY_EMAIL = 'alertEmail';
const GPS_TIMEOUT_MS    = 15000;
const GPS_MAX_AGE_MS    = 10000;

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

/**
 * Déclenche le pipeline complet d'alerte d'intrusion.
 *
 * @param {React.RefObject} cameraRef - Ref vers le composant VisionCamera.
 * @returns {Promise<boolean>} true si l'alerte a été envoyée avec succès.
 */
export async function triggerIntrusionAlert(cameraRef) {
  console.log('[SecurityService] ══════════════════════════════════════════');
  console.log('[SecurityService] INTRUSION ALERT PIPELINE INITIATED');
  console.log('[SecurityService] ══════════════════════════════════════════');

  const timestamp = new Date().toISOString();

  // ── ÉTAPE 1 : EMAIL DESTINATAIRE ──────────────────────────────────────────
  let recipientEmail = 'unconfigured@aegislock.local';
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY_EMAIL);
    if (stored && stored.trim().length > 0) {
      recipientEmail = stored.trim();
    }
    console.log('[SecurityService] Step 1 — Recipient:', recipientEmail);
  } catch (err) {
    console.error('[SecurityService] Step 1 failed (storage):', err.message);
  }

  // ── ÉTAPE 2 : PHOTO FRONTALE ───────────────────────────────────────────────
  let photoPath = null;
  try {
    if (cameraRef?.current) {
      const photo = await cameraRef.current.takePhoto({
        qualityPrioritization: 'speed',
        flash: 'off',
        enableShutterSound: false,
      });
      photoPath = photo.path;
      console.log('[SecurityService] Step 2 — Photo:', photoPath);
    } else {
      console.warn('[SecurityService] Step 2 skipped — camera ref unavailable');
    }
  } catch (err) {
    console.error('[SecurityService] Step 2 failed (camera):', err.message);
  }

  // ── ÉTAPE 3 : COORDONNÉES GPS ──────────────────────────────────────────────
  let latitude  = null;
  let longitude = null;
  try {
    const position = await getGPSPosition();
    latitude  = position.coords.latitude;
    longitude = position.coords.longitude;
    console.log(`[SecurityService] Step 3 — GPS: ${latitude}, ${longitude}`);
  } catch (err) {
    console.error('[SecurityService] Step 3 failed (GPS):', err.message);
  }

  // ── ÉTAPE 4 : ENVOI EMAIL VIA EMAILJS ─────────────────────────────────────
  try {
    const success = await sendAlertViaEmailJS(
      recipientEmail, photoPath, latitude, longitude, timestamp,
    );
    console.log('[SecurityService] Step 4 — Alert sent:', success);
    return success;
  } catch (err) {
    console.error('[SecurityService] Step 4 failed (send):', err.message);
    return false;
  }
}

// ─── PRIVATE HELPERS ──────────────────────────────────────────────────────────

/**
 * Demande la permission GPS au runtime (Android 6+) si pas encore accordée.
 * Sur iOS, Geolocation gère la demande automatiquement.
 * @returns {Promise<boolean>} true si la permission est accordée.
 */
async function ensureLocationPermission() {
  if (Platform.OS !== 'android') {
    return true; // iOS : géré automatiquement par Geolocation
  }

  try {
    const already = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    );
    if (already) { return true; }

    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      {
        title: 'AegisLock — Accès à la localisation',
        message: 'Nécessaire pour inclure la position GPS dans les rapports d\'intrusion.',
        buttonPositive: 'Autoriser',
        buttonNegative: 'Refuser',
      },
    );

    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch (err) {
    console.error('[SecurityService] Location permission request failed:', err.message);
    return false;
  }
}

/**
 * Promisifie l'API callback de Geolocation.getCurrentPosition.
 * Demande la permission runtime avant d'appeler l'API.
 */
async function getGPSPosition() {
  const granted = await ensureLocationPermission();
  if (!granted) {
    throw new Error('Location permission denied');
  }

  return new Promise((resolve, reject) => {
    Geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: GPS_TIMEOUT_MS,
      maximumAge: GPS_MAX_AGE_MS,
    });
  });
}

/**
 * Envoie l'alerte via l'API REST EmailJS.
 *
 * EmailJS utilise un "template" configuré dans le dashboard web.
 * Les template_params ci-dessous sont disponibles dans le template
 * sous forme de variables : {{to_email}}, {{intrusion_time}}, etc.
 *
 * Template EmailJS à créer dans le dashboard (contenu HTML recommandé) :
 * ┌──────────────────────────────────────────────────────────────┐
 * │ To      : {{to_email}}                                       │
 * │ Subject : 🚨 [AEGISLOCK] INTRUSION DETECTED — {{intrusion_time}} │
 * │                                                              │
 * │ Variables disponibles dans le corps HTML :                   │
 * │   {{intrusion_time}}  — horodatage UTC                       │
 * │   {{latitude}}        — latitude GPS brute                   │
 * │   {{longitude}}       — longitude GPS brute                  │
 * │   {{location_text}}   — "lat, lng" formaté                   │
 * │   {{maps_link}}       — lien Google Maps cliquable           │
 * │   {{photo_info}}      — info capture caméra                  │
 * │   {{severity}}        — CRITICAL                             │
 * └──────────────────────────────────────────────────────────────┘
 *
 * @param {string}      recipientEmail
 * @param {string|null} photoPath
 * @param {number|null} latitude
 * @param {number|null} longitude
 * @param {string}      timestamp  ISO 8601
 * @returns {Promise<boolean>}
 */
async function sendAlertViaEmailJS(
  recipientEmail, photoPath, latitude, longitude, timestamp,
) {
  if (!EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID || !EMAILJS_PUBLIC_KEY) {
    console.error(
      '[SecurityService] EmailJS not configured — set EMAILJS_SERVICE_ID, ' +
      'EMAILJS_TEMPLATE_ID and EMAILJS_PUBLIC_KEY in .env',
    );
    return false;
  }

  const hasGPS = latitude !== null && longitude !== null;

  const locationText = hasGPS
    ? `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
    : 'Indisponible (GPS refusé ou timeout)';

  // Lien Google Maps pointant exactement sur les coordonnées, zoom 18 (rue)
  const mapsLink = hasGPS
    ? `https://www.google.com/maps?q=${latitude},${longitude}&z=18&t=h`
    : null;

  const photoInfo = photoPath
    ? `Capturée — chemin: ${photoPath}`
    : 'Indisponible (caméra refusée ou erreur)';

  const formattedTime = timestamp.replace('T', ' ').replace('Z', ' UTC');

  const payload = {
    service_id:  EMAILJS_SERVICE_ID,
    template_id: EMAILJS_TEMPLATE_ID,
    user_id:     EMAILJS_PUBLIC_KEY,
    template_params: {
      to_email:       recipientEmail,
      intrusion_time: formattedTime,
      latitude:       hasGPS ? latitude.toFixed(6)  : 'N/A',
      longitude:      hasGPS ? longitude.toFixed(6) : 'N/A',
      location_text:  locationText,
      maps_link:      mapsLink || 'Position GPS non disponible',
      photo_info:     photoInfo,
      severity:       'CRITICAL',
      alert_type:     'INTRUSION_DETECTED',
    },
  };

  console.log('[SecurityService] Sending alert via EmailJS to:', recipientEmail);

  const response = await fetch(EMAILJS_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error('[SecurityService] EmailJS error:', response.status, body);
    return false;
  }

  console.log('[SecurityService] EmailJS alert delivered successfully');
  return true;
}
