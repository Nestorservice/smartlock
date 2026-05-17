import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  BackHandler,
  Animated,
  StatusBar,
  Dimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ReactNativeBiometrics from 'react-native-biometrics';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { startShakeDetection, stopShakeDetection } from '../services/ShakeService';
import { evaluateFormula } from '../services/MathService';
import { triggerIntrusionAlert } from '../services/SecurityService';
import { COLORS, TYPOGRAPHY, SPACING, BORDERS, ANIMATION, GLOW } from '../theme';

const KEY_FORMULA = 'formula';
const KEY_SHAKE_ENABLED = 'shakeEnabled';
const KEY_BIOMETRICS_ENABLED = 'biometricsEnabled';
const KEY_MAX_ATTEMPTS = 'maxAttempts';

const DEFAULT_FORMULA = 'j';
const DEFAULT_MAX_ATTEMPTS = 3;

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SCANLINE_COUNT = Math.floor(SCREEN_HEIGHT / 6);

const LockScreen = ({ navigation }) => {
  const [shakeEnabled, setShakeEnabled] = useState(false);
  const [biometricsEnabled, setBiometricsEnabled] = useState(false);
  const [maxAttempts, setMaxAttempts] = useState(DEFAULT_MAX_ATTEMPTS);
  const [requiredShakes, setRequiredShakes] = useState(0);
  const [currentShakes, setCurrentShakes] = useState(0);
  const [attemptCount, setAttemptCount] = useState(0);
  const [intrusionDetected, setIntrusionDetected] = useState(false);
  const [statusMessage, setStatusMessage] = useState('INITIALIZING...');
  const [isConfigLoaded, setIsConfigLoaded] = useState(false);
  // BUG FIX: live clock with state + interval
  const [clockDisplay, setClockDisplay] = useState('');

  const cameraRef = useRef(null);
  // BUG FIX: guard ref to prevent biometrics re-triggering on re-render
  const biometricsTriggered = useRef(false);

  // Camera permission — requested once on mount, required for intrusion capture
  const { hasPermission: hasCameraPermission, requestPermission: requestCameraPermission } =
    useCameraPermission();

  const flickerAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(0.5)).current;
  const intrusionPulse = useRef(new Animated.Value(1)).current;
  const sensorRingScale = useRef(new Animated.Value(1)).current;
  const ringInner = useRef(new Animated.Value(0.88)).current;
  const accessGrantedOpacity = useRef(new Animated.Value(0)).current;

  const device = useCameraDevice('front');

  // ── LIVE CLOCK ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setClockDisplay(now.toISOString().replace('T', ' ').substring(0, 19) + ' UTC');
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  // ── BACK BUTTON INTERCEPT ──────────────────────────────────────────────────
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      console.log('[LockScreen] Back button blocked');
      return true;
    });
    return () => backHandler.remove();
  }, []);

  // ── CAMERA PERMISSION ──────────────────────────────────────────────────────
  // Request silently on mount — no UI shown, camera is only for covert capture
  useEffect(() => {
    if (!hasCameraPermission) {
      requestCameraPermission().then(granted => {
        if (!granted) {
          console.warn('[LockScreen] Camera permission denied — intrusion photo unavailable');
        }
      });
    }
  }, [hasCameraPermission, requestCameraPermission]);

  // ── INITIALIZATION ─────────────────────────────────────────────────────────
  useEffect(() => {
    startFlickerAnimation();
    startPulseAnimation();
    startSensorRingPulse();
    startRingInnerPulse();
    initializeLockScreen();

    return () => {
      stopShakeDetection();
    };
  }, []);

  const initializeLockScreen = async () => {
    try {
      const [storedFormula, storedShake, storedBio, storedAttempts] =
        await AsyncStorage.multiGet([KEY_FORMULA, KEY_SHAKE_ENABLED, KEY_BIOMETRICS_ENABLED, KEY_MAX_ATTEMPTS]);

      const formula = storedFormula[1] || DEFAULT_FORMULA;
      const isShakeEnabled = storedShake[1] === 'true';
      const isBioEnabled = storedBio[1] === 'true';
      const maxAtt = parseInt(storedAttempts[1], 10) || DEFAULT_MAX_ATTEMPTS;
      const shakesRequired = evaluateFormula(formula);

      setShakeEnabled(isShakeEnabled);
      setBiometricsEnabled(isBioEnabled);
      setMaxAttempts(maxAtt);
      setRequiredShakes(shakesRequired);
      setIsConfigLoaded(true);

      if (isShakeEnabled) {
        setStatusMessage(`SHAKE TO UNLOCK — ${shakesRequired} REQUIRED`);
      } else if (isBioEnabled) {
        setStatusMessage('PLACE FINGER ON SENSOR');
      } else {
        setStatusMessage('NO UNLOCK MODULE ACTIVE');
      }
    } catch (error) {
      console.error('[LockScreen] Config load failed:', error.message);
      setStatusMessage('CONFIG ERROR');
    }
  };

  // ── SHAKE MODULE ───────────────────────────────────────────────────────────
  // BUG FIX: handleShakeDetected is NOT in deps to avoid subscription restart on every render
  // We use a ref to always have the latest callback inside the service
  const handleShakeDetectedRef = useRef(null);

  const handleShakeDetected = useCallback((count) => {
    setCurrentShakes(count);
    setRequiredShakes(req => {
      if (count >= req && req > 0) {
        handleSuccessfulUnlock();
      } else {
        const remaining = Math.max(0, req - count);
        setStatusMessage(`SHAKES REMAINING: ${remaining}`);
      }
      return req;
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    handleShakeDetectedRef.current = handleShakeDetected;
  }, [handleShakeDetected]);

  useEffect(() => {
    if (!isConfigLoaded || !shakeEnabled || intrusionDetected) { return; }

    // Pass a stable wrapper so ShakeService always calls the latest version
    startShakeDetection((count) => {
      if (handleShakeDetectedRef.current) {
        handleShakeDetectedRef.current(count);
      }
    });

    return () => stopShakeDetection();
  }, [isConfigLoaded, shakeEnabled, intrusionDetected]);

  // ── BIOMETRICS MODULE ──────────────────────────────────────────────────────
  useEffect(() => {
    // BUG FIX: guard prevents re-triggering on re-renders
    if (!isConfigLoaded || !biometricsEnabled || intrusionDetected) { return; }
    if (biometricsTriggered.current) { return; }

    biometricsTriggered.current = true;
    triggerBiometricAuth();
  }, [isConfigLoaded, biometricsEnabled, intrusionDetected]);

  // ── ANIMATION FUNCTIONS ────────────────────────────────────────────────────
  const startFlickerAnimation = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(flickerAnim, { toValue: 0.80, duration: ANIMATION.flickerInterval, useNativeDriver: true }),
        Animated.timing(flickerAnim, { toValue: 1, duration: ANIMATION.flickerInterval * 4, useNativeDriver: true }),
        Animated.timing(flickerAnim, { toValue: 0.92, duration: ANIMATION.flickerInterval, useNativeDriver: true }),
        Animated.timing(flickerAnim, { toValue: 1, duration: ANIMATION.flickerInterval * 7, useNativeDriver: true }),
      ]),
    ).start();
  };

  const startPulseAnimation = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: ANIMATION.pulseDuration, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.4, duration: ANIMATION.pulseDuration, useNativeDriver: true }),
      ]),
    ).start();
  };

  const startSensorRingPulse = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(sensorRingScale, { toValue: 1.12, duration: ANIMATION.pulseDuration, useNativeDriver: true }),
        Animated.timing(sensorRingScale, { toValue: 1, duration: ANIMATION.pulseDuration, useNativeDriver: true }),
      ]),
    ).start();
  };

  const startRingInnerPulse = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(ringInner, { toValue: 1, duration: ANIMATION.pulseDuration * 1.3, useNativeDriver: true }),
        Animated.timing(ringInner, { toValue: 0.88, duration: ANIMATION.pulseDuration * 1.3, useNativeDriver: true }),
      ]),
    ).start();
  };

  const startIntrusionPulse = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(intrusionPulse, { toValue: 0.25, duration: 450, useNativeDriver: true }),
        Animated.timing(intrusionPulse, { toValue: 1, duration: 450, useNativeDriver: true }),
      ]),
    ).start();
  };

  // ── EVENT HANDLERS ─────────────────────────────────────────────────────────
  const triggerBiometricAuth = async () => {
    try {
      setStatusMessage('PLACE FINGER ON SENSOR');
      const rnBiometrics = new ReactNativeBiometrics();
      const { success, error } = await rnBiometrics.simplePrompt({
        promptMessage: 'AegisLock biometric verification required',
      });

      if (success) {
        handleSuccessfulUnlock();
      } else {
        console.log('[LockScreen] Biometric failed:', error || 'cancelled');
        biometricsTriggered.current = false; // Allow re-trigger after failure
        handleFailedAttempt();
      }
    } catch (error) {
      console.error('[LockScreen] Biometric error:', error.message);
      biometricsTriggered.current = false;
      handleFailedAttempt();
    }
  };

  const handleSuccessfulUnlock = () => {
    stopShakeDetection();
    setStatusMessage('ACCESS GRANTED');

    Animated.timing(accessGrantedOpacity, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();

    setTimeout(() => navigation.goBack(), 900);
  };

  // BUG FIX: use functional setState to avoid stale closure on attemptCount
  const handleFailedAttempt = () => {
    setAttemptCount(prev => {
      const newCount = prev + 1;
      console.log(`[LockScreen] Failed attempt ${newCount}`);

      setMaxAttempts(max => {
        if (newCount >= max) {
          handleIntrusionDetected();
        } else {
          const remaining = max - newCount;
          setStatusMessage(`AUTH FAILED — ${remaining} ATTEMPT${remaining !== 1 ? 'S' : ''} REMAINING`);
          if (biometricsEnabled) {
            setTimeout(() => {
              biometricsTriggered.current = false;
              triggerBiometricAuth();
            }, 1500);
          }
        }
        return max;
      });

      return newCount;
    });
  };

  const handleIntrusionDetected = async () => {
    console.log('[LockScreen] !! INTRUSION DETECTED !!');
    setIntrusionDetected(true);
    setStatusMessage('INTRUSION DETECTED');
    stopShakeDetection();
    startIntrusionPulse();
    await triggerIntrusionAlert(cameraRef);
  };

  // ── RENDER HELPERS ─────────────────────────────────────────────────────────
  const renderScanlines = () => {
    const lines = [];
    for (let i = 0; i < SCANLINE_COUNT; i++) {
      lines.push(
        <View key={i} style={[styles.scanlineLine, { top: i * 6 }]} />,
      );
    }
    return lines;
  };

  const renderShakeProgress = () => {
    if (!shakeEnabled || !isConfigLoaded) { return null; }

    const remaining = Math.max(0, requiredShakes - currentShakes);
    const progress = requiredShakes > 0 ? Math.min(1, currentShakes / requiredShakes) : 0;
    const ringColor = intrusionDetected ? COLORS.crimson : COLORS.cyan;
    const ringGlow = intrusionDetected ? GLOW.crimson : GLOW.cyan;

    return (
      <View style={styles.shakeProgressContainer}>
        {/* Outer decorative ring */}
        <Animated.View
          style={[
            styles.sensorRingOuter,
            { transform: [{ scale: sensorRingScale }], borderColor: ringColor, opacity: 0.3 },
          ]}
        />
        {/* Middle ring */}
        <Animated.View
          style={[
            styles.sensorRingMiddle,
            { transform: [{ scale: ringInner }], borderColor: ringColor, opacity: 0.6, ...ringGlow },
          ]}
        />
        {/* Inner ring with count */}
        <View style={[styles.sensorRingInner, { borderColor: ringColor }]}>
          <Text style={[styles.shakeCountText, { color: ringColor }]}>{remaining}</Text>
          <Text style={styles.shakeCountLabel}>REMAINING</Text>
        </View>

        {/* Progress bar */}
        <View style={styles.progressBarTrack}>
          <View style={styles.progressBarRail} />
          <Animated.View
            style={[
              styles.progressBarFill,
              {
                width: `${progress * 100}%`,
                backgroundColor: ringColor,
              },
            ]}
          />
        </View>

        <Text style={styles.progressText}>
          {currentShakes} / {requiredShakes}  SHAKES DETECTED
        </Text>
      </View>
    );
  };

  // ── MAIN RENDER ────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} hidden={false} />

      {/* Hidden camera — seulement si permission accordée ET device disponible */}
      {hasCameraPermission && device && (
        <Camera
          ref={cameraRef}
          style={styles.hiddenCamera}
          device={device}
          isActive
          photo
        />
      )}

      {/* Scanline overlay */}
      <View style={styles.scanlineOverlay} pointerEvents="none">
        {renderScanlines()}
      </View>

      {/* Access granted flash overlay */}
      <Animated.View
        style={[styles.accessGrantedOverlay, { opacity: accessGrantedOpacity }]}
        pointerEvents="none"
      />

      <View style={styles.content}>
        {/* ── TOP STATUS BAR ───────────────────────────────────── */}
        <View style={styles.topBar}>
          <View style={styles.topBarLeft}>
            <View style={[
              styles.topBarDot,
              intrusionDetected ? styles.topBarDotRed : styles.topBarDotGreen,
            ]} />
            <Text style={styles.topBarText}>
              {intrusionDetected ? 'BREACH' : 'SECURED'}
            </Text>
          </View>
          <Text style={styles.topBarText}>AEGISLOCK</Text>
          <Text style={styles.topBarText}>LOCK-{Date.now().toString().slice(-4)}</Text>
        </View>

        {/* ── HEADER ───────────────────────────────────────────── */}
        <Animated.View
          style={[
            styles.headerContainer,
            { opacity: intrusionDetected ? intrusionPulse : flickerAnim },
          ]}
        >
          {/* Corner brackets */}
          <View style={[styles.cornerTL, intrusionDetected && styles.cornerCrimson]} />
          <View style={[styles.cornerTR, intrusionDetected && styles.cornerCrimson]} />

          <Text style={[
            styles.headerLabel,
            intrusionDetected && styles.headerLabelIntrusion,
          ]}>
            {intrusionDetected ? '// SECURITY BREACH' : '// DEVICE SECURED'}
          </Text>
          <Text style={[
            styles.headerText,
            intrusionDetected && styles.headerTextIntrusion,
          ]}>
            {intrusionDetected ? 'INTRUSION' : 'AEGISLOCK'}
          </Text>
        </Animated.View>

        {/* ── DIVIDER ─────────────────────────────────────────── */}
        <View style={[
          styles.divider,
          intrusionDetected && styles.dividerCrimson,
        ]} />

        {/* ── STATUS MESSAGE ──────────────────────────────────── */}
        <Animated.View style={[styles.statusContainer, { opacity: pulseAnim }]}>
          <Text style={[
            styles.statusText,
            intrusionDetected && styles.statusTextIntrusion,
          ]}>
            {statusMessage}
          </Text>
        </Animated.View>

        {/* ── SHAKE PROGRESS ──────────────────────────────────── */}
        {renderShakeProgress()}

        {/* ── ATTEMPT COUNTER ─────────────────────────────────── */}
        {attemptCount > 0 && (
          <View style={[
            styles.attemptContainer,
            intrusionDetected && styles.attemptContainerCritical,
          ]}>
            <Text style={styles.attemptLabel}>FAILED ATTEMPTS</Text>
            <Text style={[
              styles.attemptCount,
              intrusionDetected && styles.attemptCountCritical,
            ]}>
              {attemptCount} / {maxAttempts}
            </Text>
          </View>
        )}

        {/* ── FOOTER ──────────────────────────────────────────── */}
        <View style={styles.footer}>
          <View style={styles.footerRow}>
            <View style={styles.footerDivider} />
          </View>
          <View style={styles.footerContent}>
            <Text style={styles.footerLabel}>AEGISLOCK  //  SECURITY ACTIVE</Text>
            {/* BUG FIX: live timestamp via state — no longer frozen at mount time */}
            <Text style={styles.footerTimestamp}>{clockDisplay}</Text>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  // ── HIDDEN CAMERA ──────────────────────────────────────────────────────────
  hiddenCamera: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },

  // ── SCANLINES ──────────────────────────────────────────────────────────────
  scanlineOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5,
  },
  scanlineLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: COLORS.scanline,
  },

  // ── ACCESS GRANTED OVERLAY ─────────────────────────────────────────────────
  accessGrantedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.successDim,
    zIndex: 20,
  },

  // ── CONTENT ────────────────────────────────────────────────────────────────
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    zIndex: 10,
  },

  // ── TOP BAR ────────────────────────────────────────────────────────────────
  topBar: {
    position: 'absolute',
    top: SPACING.md,
    left: SPACING.md,
    right: SPACING.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: SPACING.xs,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderDim,
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  topBarDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  topBarDotGreen: {
    backgroundColor: COLORS.online,
  },
  topBarDotRed: {
    backgroundColor: COLORS.crimson,
  },
  topBarText: {
    fontFamily: TYPOGRAPHY.fontFamily,
    fontSize: TYPOGRAPHY.sizes.xxs,
    color: COLORS.slateDark,
    letterSpacing: TYPOGRAPHY.letterSpacing.wide,
  },

  // ── HEADER ─────────────────────────────────────────────────────────────────
  headerContainer: {
    alignItems: 'center',
    marginBottom: SPACING.lg,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    position: 'relative',
  },
  cornerTL: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 14,
    height: 14,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderColor: COLORS.cyan,
  },
  cornerTR: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 14,
    height: 14,
    borderTopWidth: 2,
    borderRightWidth: 2,
    borderColor: COLORS.cyan,
  },
  cornerCrimson: {
    borderColor: COLORS.crimson,
  },
  headerLabel: {
    fontFamily: TYPOGRAPHY.fontFamily,
    fontSize: TYPOGRAPHY.sizes.xxs,
    color: COLORS.slateDark,
    letterSpacing: TYPOGRAPHY.letterSpacing.wider,
    marginBottom: SPACING.xs,
  },
  headerLabelIntrusion: {
    color: COLORS.crimsonBright,
  },
  headerText: {
    fontFamily: TYPOGRAPHY.fontFamilyBold,
    fontSize: TYPOGRAPHY.sizes.display,
    color: COLORS.steel,
    letterSpacing: TYPOGRAPHY.letterSpacing.ultraWide,
    textAlign: 'center',
  },
  headerTextIntrusion: {
    color: COLORS.crimson,
  },

  // ── DIVIDER ────────────────────────────────────────────────────────────────
  divider: {
    width: SCREEN_WIDTH * 0.55,
    height: 1,
    backgroundColor: COLORS.steel,
    marginBottom: SPACING.lg,
    opacity: 0.5,
  },
  dividerCrimson: {
    backgroundColor: COLORS.crimson,
    opacity: 0.7,
  },

  // ── STATUS ─────────────────────────────────────────────────────────────────
  statusContainer: {
    marginBottom: SPACING.xl,
    alignItems: 'center',
  },
  statusText: {
    fontFamily: TYPOGRAPHY.fontFamilyBold,
    fontSize: TYPOGRAPHY.sizes.sm,
    color: COLORS.cyan,
    letterSpacing: TYPOGRAPHY.letterSpacing.wider,
    textAlign: 'center',
  },
  statusTextIntrusion: {
    color: COLORS.crimson,
  },

  // ── SHAKE PROGRESS ─────────────────────────────────────────────────────────
  shakeProgressContainer: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
    position: 'relative',
  },
  // Three concentric rings for the dramatic effect
  sensorRingOuter: {
    position: 'absolute',
    width: 168,
    height: 168,
    borderRadius: 84,
    borderWidth: 1,
    top: -4,
    left: -4,   // centered on the middle ring
    // offset: container width is 160, outer is 168, so -4
    alignSelf: 'center',
  },
  sensorRingMiddle: {
    position: 'absolute',
    width: 148,
    height: 148,
    borderRadius: 74,
    borderWidth: 2,
    top: 6,
    alignSelf: 'center',
  },
  sensorRingInner: {
    width: 128,
    height: 128,
    borderRadius: 64,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    marginBottom: SPACING.md,
  },
  shakeCountText: {
    fontFamily: TYPOGRAPHY.fontFamilyBold,
    fontSize: TYPOGRAPHY.sizes.hero,
    lineHeight: 52,
  },
  shakeCountLabel: {
    fontFamily: TYPOGRAPHY.fontFamily,
    fontSize: TYPOGRAPHY.sizes.xxs,
    color: COLORS.slateDark,
    letterSpacing: TYPOGRAPHY.letterSpacing.wide,
  },

  // Progress bar
  progressBarTrack: {
    width: SCREEN_WIDTH * 0.55,
    height: 3,
    backgroundColor: COLORS.borderDim,
    marginBottom: SPACING.sm,
    overflow: 'hidden',
    position: 'relative',
  },
  progressBarRail: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.borderDim,
  },
  progressBarFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },
  progressText: {
    fontFamily: TYPOGRAPHY.fontFamily,
    fontSize: TYPOGRAPHY.sizes.xxs,
    color: COLORS.slateDark,
    letterSpacing: TYPOGRAPHY.letterSpacing.wide,
  },

  // ── ATTEMPT COUNTER ────────────────────────────────────────────────────────
  attemptContainer: {
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    borderWidth: BORDERS.width,
    borderColor: COLORS.steel,
    backgroundColor: COLORS.surface,
    marginBottom: SPACING.lg,
  },
  attemptContainerCritical: {
    borderColor: COLORS.crimson,
    backgroundColor: COLORS.crimsonDim,
  },
  attemptLabel: {
    fontFamily: TYPOGRAPHY.fontFamily,
    fontSize: TYPOGRAPHY.sizes.xxs,
    color: COLORS.slateDark,
    letterSpacing: TYPOGRAPHY.letterSpacing.wide,
    marginBottom: SPACING.xxs,
  },
  attemptCount: {
    fontFamily: TYPOGRAPHY.fontFamilyBold,
    fontSize: TYPOGRAPHY.sizes.xl,
    color: COLORS.textPrimary,
  },
  attemptCountCritical: {
    color: COLORS.crimson,
  },

  // ── FOOTER ─────────────────────────────────────────────────────────────────
  footer: {
    position: 'absolute',
    bottom: SPACING.xl,
    alignItems: 'center',
    width: '100%',
  },
  footerRow: {
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  footerDivider: {
    width: SCREEN_WIDTH * 0.35,
    height: 1,
    backgroundColor: COLORS.borderDim,
  },
  footerContent: {
    alignItems: 'center',
    gap: SPACING.xxs,
  },
  footerLabel: {
    fontFamily: TYPOGRAPHY.fontFamily,
    fontSize: TYPOGRAPHY.sizes.xxs,
    color: COLORS.slateDark,
    letterSpacing: TYPOGRAPHY.letterSpacing.wide,
  },
  footerTimestamp: {
    fontFamily: TYPOGRAPHY.fontFamily,
    fontSize: TYPOGRAPHY.sizes.xxs,
    color: COLORS.steel,
    letterSpacing: TYPOGRAPHY.letterSpacing.normal,
  },
});

export default LockScreen;
