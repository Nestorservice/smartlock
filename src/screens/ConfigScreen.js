import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Switch,
  ScrollView,
  StyleSheet,
  Animated,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { translateInstructionWithGemini } from '../services/GeminiService';
import { COLORS, TYPOGRAPHY, SPACING, BORDERS, ANIMATION, GLOW } from '../theme';

const KEY_FORMULA = 'formula';
const KEY_SHAKE_ENABLED = 'shakeEnabled';
const KEY_BIOMETRICS_ENABLED = 'biometricsEnabled';
const KEY_MAX_ATTEMPTS = 'maxAttempts';
const KEY_ALERT_EMAIL = 'alertEmail';
const KEY_INSTRUCTION = 'lastInstruction';

const DEFAULT_FORMULA = 'j';
const DEFAULT_MAX_ATTEMPTS = '3';
const DEFAULT_SHAKE_ENABLED = true;
const DEFAULT_BIOMETRICS_ENABLED = false;

// BUG FIX: simple email format check
const isValidEmail = (email) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

const ConfigScreen = ({ navigation }) => {
  const [instruction, setInstruction] = useState('');
  const [formula, setFormula] = useState(DEFAULT_FORMULA);
  const [isGenerating, setIsGenerating] = useState(false);
  const [shakeEnabled, setShakeEnabled] = useState(DEFAULT_SHAKE_ENABLED);
  const [biometricsEnabled, setBiometricsEnabled] = useState(DEFAULT_BIOMETRICS_ENABLED);
  const [maxAttempts, setMaxAttempts] = useState(DEFAULT_MAX_ATTEMPTS);
  const [alertEmail, setAlertEmail] = useState('');
  const [saveStatus, setSaveStatus] = useState(null);
  const [systemTime, setSystemTime] = useState('');

  const cursorOpacity = useRef(new Animated.Value(1)).current;
  const saveFlash = useRef(new Animated.Value(0)).current;
  const headerFlicker = useRef(new Animated.Value(1)).current;
  const generatePulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    loadConfiguration();
    startCursorBlink();
    startHeaderFlicker();
    updateClock();
    const clockInterval = setInterval(updateClock, 1000);
    return () => clearInterval(clockInterval);
  }, []);

  const updateClock = () => {
    const now = new Date();
    setSystemTime(now.toISOString().replace('T', ' ').substring(0, 19) + ' UTC');
  };

  const loadConfiguration = async () => {
    try {
      const [storedFormula, storedShake, storedBio, storedAttempts, storedEmail, storedInstruction] =
        await AsyncStorage.multiGet([
          KEY_FORMULA, KEY_SHAKE_ENABLED, KEY_BIOMETRICS_ENABLED,
          KEY_MAX_ATTEMPTS, KEY_ALERT_EMAIL, KEY_INSTRUCTION,
        ]);

      if (storedFormula[1]) { setFormula(storedFormula[1]); }
      if (storedShake[1] !== null) { setShakeEnabled(storedShake[1] === 'true'); }
      if (storedBio[1] !== null) { setBiometricsEnabled(storedBio[1] === 'true'); }
      if (storedAttempts[1]) { setMaxAttempts(storedAttempts[1]); }
      if (storedEmail[1]) { setAlertEmail(storedEmail[1]); }
      if (storedInstruction[1]) { setInstruction(storedInstruction[1]); }
    } catch (error) {
      console.error('[ConfigScreen] Failed to load configuration:', error.message);
    }
  };

  const startCursorBlink = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(cursorOpacity, { toValue: 0, duration: 500, useNativeDriver: true }),
        Animated.timing(cursorOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]),
    ).start();
  };

  const startHeaderFlicker = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(headerFlicker, { toValue: 0.82, duration: ANIMATION.flickerInterval, useNativeDriver: true }),
        Animated.timing(headerFlicker, { toValue: 1, duration: ANIMATION.flickerInterval * 3, useNativeDriver: true }),
        Animated.timing(headerFlicker, { toValue: 0.91, duration: ANIMATION.flickerInterval, useNativeDriver: true }),
        Animated.timing(headerFlicker, { toValue: 1, duration: ANIMATION.flickerInterval * 6, useNativeDriver: true }),
      ]),
    ).start();
  };

  const handleGenerateFormula = async () => {
    if (!instruction.trim()) { return; }
    setIsGenerating(true);

    // Pulse the button while processing
    Animated.loop(
      Animated.sequence([
        Animated.timing(generatePulse, { toValue: 0.6, duration: 400, useNativeDriver: true }),
        Animated.timing(generatePulse, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]),
    ).start();

    try {
      const result = await translateInstructionWithGemini(instruction);
      setFormula(result);
    } catch (error) {
      console.error('[ConfigScreen] Formula generation failed:', error.message);
      setFormula(DEFAULT_FORMULA);
    } finally {
      setIsGenerating(false);
      generatePulse.stopAnimation();
      generatePulse.setValue(1);
    }
  };

  // BUG FIX: validate maxAttempts (min 1, max 10) and email before saving
  const handleSaveConfiguration = async () => {
    const attempts = parseInt(maxAttempts, 10);
    if (isNaN(attempts) || attempts < 1 || attempts > 10) {
      Alert.alert('INVALID INPUT', 'Max attempts must be between 1 and 10.');
      setSaveStatus('error');
      setTimeout(() => setSaveStatus(null), 2000);
      return;
    }

    if (alertEmail.trim() && !isValidEmail(alertEmail)) {
      Alert.alert('INVALID EMAIL', 'Please enter a valid alert email address.');
      setSaveStatus('error');
      setTimeout(() => setSaveStatus(null), 2000);
      return;
    }

    try {
      await AsyncStorage.multiSet([
        [KEY_FORMULA, formula],
        [KEY_SHAKE_ENABLED, String(shakeEnabled)],
        [KEY_BIOMETRICS_ENABLED, String(biometricsEnabled)],
        [KEY_MAX_ATTEMPTS, String(attempts)],
        [KEY_ALERT_EMAIL, alertEmail.trim()],
        [KEY_INSTRUCTION, instruction],
      ]);

      setSaveStatus('success');
      Animated.sequence([
        Animated.timing(saveFlash, { toValue: 1, duration: 200, useNativeDriver: false }),
        Animated.timing(saveFlash, { toValue: 0, duration: 1800, useNativeDriver: false }),
      ]).start(() => setSaveStatus(null));
    } catch (error) {
      console.error('[ConfigScreen] Save failed:', error.message);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus(null), 2000);
    }
  };

  const handleActivateLock = () => {
    navigation.navigate('LockScreen');
  };

  // BUG FIX: saveBorderColor starts from COLORS.border (not crimson) at rest
  const saveBorderColor = saveFlash.interpolate({
    inputRange: [0, 1],
    outputRange: [COLORS.border, COLORS.success],
  });

  // BUG FIX: validate maxAttempts input — only allow 1–10
  const handleMaxAttemptsChange = (text) => {
    const digits = text.replace(/[^0-9]/g, '');
    if (digits === '' || (parseInt(digits, 10) >= 1 && parseInt(digits, 10) <= 10)) {
      setMaxAttempts(digits);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />

      {/* Grid background */}
      <View style={styles.gridOverlay} pointerEvents="none" />
      {/* Scanline overlay */}
      <View style={styles.scanlineOverlay} pointerEvents="none" />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoid}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ── SYSTEM STATUS BAR ──────────────────────────────────── */}
          <View style={styles.statusBar}>
            <View style={styles.statusLeft}>
              <View style={styles.onlineDot} />
              <Text style={styles.statusBarText}>SYS ONLINE</Text>
            </View>
            <Text style={styles.statusBarText}>{systemTime}</Text>
            <View style={styles.statusRight}>
              <Text style={styles.statusBarText}>v1.0.0</Text>
              <View style={[styles.onlineDot, styles.onlineDotCyan]} />
            </View>
          </View>

          {/* ── HEADER ──────────────────────────────────────────────── */}
          <Animated.View style={[styles.header, { opacity: headerFlicker }]}>
            <View style={styles.headerCornerTL} />
            <View style={styles.headerCornerTR} />
            <Text style={styles.headerLabel}>// TERMINAL CONTROL PANEL</Text>
            <Text style={styles.headerTitle}>AEGISLOCK</Text>
            <Text style={styles.headerSubtitle}>MILITARY-GRADE SECURITY CONFIGURATION</Text>
            <View style={styles.headerCornerBL} />
            <View style={styles.headerCornerBR} />
          </Animated.View>

          <View style={styles.headerDivider} />

          {/* ── AI FORMULA TERMINAL ─────────────────────────────────── */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionIndex}>01</Text>
              <Text style={styles.sectionLabel}>AI FORMULA TERMINAL</Text>
              <View style={styles.sectionHeaderLine} />
            </View>

            <View style={styles.terminalInputContainer}>
              <View style={styles.terminalPromptRow}>
                <Text style={styles.terminalPrompt}>{'>'}</Text>
                {/* BUG FIX: autoCorrect, autoCapitalize, spellCheck disabled */}
                <TextInput
                  style={styles.terminalInput}
                  value={instruction}
                  onChangeText={setInstruction}
                  placeholder="Describe unlock rule in natural language..."
                  placeholderTextColor={COLORS.slateDark}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  autoCorrect={false}
                  autoCapitalize="none"
                  spellCheck={false}
                />
                <Animated.View style={[styles.cursorIndicator, { opacity: cursorOpacity }]} />
              </View>
            </View>

            <Animated.View style={{ opacity: generatePulse }}>
              <TouchableOpacity
                style={[styles.generateButton, isGenerating && styles.generateButtonActive]}
                onPress={handleGenerateFormula}
                activeOpacity={ANIMATION.pressOpacity}
                disabled={isGenerating}
              >
                <Text style={styles.generateButtonText}>
                  {isGenerating ? '◈  PROCESSING...' : '◈  GENERATE FORMULA'}
                </Text>
              </TouchableOpacity>
            </Animated.View>

            <View style={styles.formulaDisplay}>
              <View style={styles.formulaHeader}>
                <View style={styles.formulaDot} />
                <Text style={styles.formulaLabel}>ACTIVE FORMULA</Text>
              </View>
              <Text style={styles.formulaValue}>{formula}</Text>
              <Text style={styles.formulaHint}>j = day of week  (1=MON → 7=SUN)</Text>
            </View>
          </View>

          {/* ── MODULE CONTROL ───────────────────────────────────────── */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionIndex}>02</Text>
              <Text style={styles.sectionLabel}>MODULE CONTROL</Text>
              <View style={styles.sectionHeaderLine} />
            </View>

            <View style={styles.moduleRow}>
              <View style={styles.moduleInfo}>
                <View style={[styles.moduleStatusDot, shakeEnabled && styles.moduleStatusDotActive]} />
                <View>
                  <Text style={styles.moduleName}>DYNAMIC SHAKE</Text>
                  <Text style={styles.moduleDesc}>Accelerometer-based unlock gesture</Text>
                </View>
              </View>
              <Switch
                value={shakeEnabled}
                onValueChange={setShakeEnabled}
                trackColor={{ false: COLORS.steelLight, true: COLORS.cyanGlow }}
                thumbColor={shakeEnabled ? COLORS.cyan : COLORS.slate}
              />
            </View>

            <View style={[styles.moduleRow, styles.moduleRowLast]}>
              <View style={styles.moduleInfo}>
                <View style={[styles.moduleStatusDot, biometricsEnabled && styles.moduleStatusDotActive]} />
                <View>
                  <Text style={styles.moduleName}>BIOMETRIC AUTH</Text>
                  <Text style={styles.moduleDesc}>Fingerprint sensor verification</Text>
                </View>
              </View>
              <Switch
                value={biometricsEnabled}
                onValueChange={setBiometricsEnabled}
                trackColor={{ false: COLORS.steelLight, true: COLORS.cyanGlow }}
                thumbColor={biometricsEnabled ? COLORS.cyan : COLORS.slate}
              />
            </View>
          </View>

          {/* ── SECURITY PARAMETERS ─────────────────────────────────── */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionIndex}>03</Text>
              <Text style={styles.sectionLabel}>SECURITY PARAMETERS</Text>
              <View style={styles.sectionHeaderLine} />
            </View>

            <View style={styles.paramBlock}>
              <Text style={styles.paramLabel}>MAX UNLOCK ATTEMPTS</Text>
              <Text style={styles.paramHint}>Range: 1 – 10  |  Triggers alert on exceed</Text>
              <TextInput
                style={styles.paramInput}
                value={maxAttempts}
                onChangeText={handleMaxAttemptsChange}
                keyboardType="numeric"
                maxLength={2}
                placeholderTextColor={COLORS.slate}
                autoCorrect={false}
              />
            </View>

            <View style={[styles.paramBlock, styles.paramBlockLast]}>
              <Text style={styles.paramLabel}>ALERT EMAIL</Text>
              <Text style={styles.paramHint}>Intrusion report destination</Text>
              <TextInput
                style={styles.paramInputWide}
                value={alertEmail}
                onChangeText={setAlertEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="operator@aegislock.io"
                placeholderTextColor={COLORS.slateDark}
              />
            </View>
          </View>

          {/* ── ACTION BUTTONS ───────────────────────────────────────── */}
          <View style={styles.actionSection}>
            <Animated.View style={[styles.saveButtonWrapper, { borderColor: saveBorderColor }]}>
              <TouchableOpacity
                style={[
                  styles.saveButton,
                  saveStatus === 'success' && styles.saveButtonSuccess,
                  saveStatus === 'error' && styles.saveButtonError,
                ]}
                onPress={handleSaveConfiguration}
                activeOpacity={ANIMATION.pressOpacity}
              >
                <Text style={[
                  styles.saveButtonText,
                  saveStatus === 'success' && styles.saveButtonTextSuccess,
                  saveStatus === 'error' && styles.saveButtonTextError,
                ]}>
                  {saveStatus === 'success'
                    ? '✓  CONFIGURATION SAVED'
                    : saveStatus === 'error'
                      ? '✗  SAVE FAILED'
                      : '▸  SAVE CONFIGURATION'}
                </Text>
              </TouchableOpacity>
            </Animated.View>

            <TouchableOpacity
              style={styles.activateButton}
              onPress={handleActivateLock}
              activeOpacity={ANIMATION.pressOpacity}
            >
              <Text style={styles.activateButtonText}>⬡  ACTIVATE LOCK</Text>
            </TouchableOpacity>
          </View>

          {/* ── FOOTER ──────────────────────────────────────────────── */}
          <View style={styles.footer}>
            <View style={styles.footerDivider} />
            <Text style={styles.footerText}>AEGISLOCK  //  ALL SYSTEMS NOMINAL</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  // ── BACKGROUNDS ────────────────────────────────────────────────────────────
  gridOverlay: {
    ...StyleSheet.absoluteFillObject,
    // Simulated grid via repeated thin borders — purely decorative
    borderWidth: 0,
    backgroundColor: 'transparent',
    // Grid expressed via borderColor on sub-elements in JSX
    zIndex: 0,
  },
  scanlineOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    borderTopWidth: 1,
    borderTopColor: COLORS.scanline,
    zIndex: 1,
  },
  keyboardAvoid: {
    flex: 1,
    zIndex: 2,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xxl,
  },

  // ── SYSTEM STATUS BAR ──────────────────────────────────────────────────────
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.xs,
    marginBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderDim,
  },
  statusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  statusRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  statusBarText: {
    fontFamily: TYPOGRAPHY.fontFamily,
    fontSize: TYPOGRAPHY.sizes.xxs,
    color: COLORS.slateDark,
    letterSpacing: TYPOGRAPHY.letterSpacing.wide,
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.online,
  },
  onlineDotCyan: {
    backgroundColor: COLORS.cyan,
  },

  // ── HEADER ─────────────────────────────────────────────────────────────────
  header: {
    alignItems: 'center',
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.xs,
    position: 'relative',
  },
  headerCornerTL: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 16,
    height: 16,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderColor: COLORS.cyan,
  },
  headerCornerTR: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 16,
    height: 16,
    borderTopWidth: 2,
    borderRightWidth: 2,
    borderColor: COLORS.cyan,
  },
  headerCornerBL: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 16,
    height: 16,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
    borderColor: COLORS.cyan,
  },
  headerCornerBR: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 16,
    height: 16,
    borderBottomWidth: 2,
    borderRightWidth: 2,
    borderColor: COLORS.cyan,
  },
  headerLabel: {
    fontFamily: TYPOGRAPHY.fontFamily,
    fontSize: TYPOGRAPHY.sizes.xxs,
    color: COLORS.slateDark,
    letterSpacing: TYPOGRAPHY.letterSpacing.wider,
    marginBottom: SPACING.xs,
  },
  headerTitle: {
    fontFamily: TYPOGRAPHY.fontFamilyBold,
    fontSize: TYPOGRAPHY.sizes.display,
    color: COLORS.cyan,
    letterSpacing: TYPOGRAPHY.letterSpacing.ultraWide,
  },
  headerSubtitle: {
    fontFamily: TYPOGRAPHY.fontFamily,
    fontSize: TYPOGRAPHY.sizes.xxs,
    color: COLORS.slate,
    letterSpacing: TYPOGRAPHY.letterSpacing.wider,
    marginTop: SPACING.xs,
  },
  headerDivider: {
    width: '100%',
    height: 1,
    backgroundColor: COLORS.steel,
    marginBottom: SPACING.lg,
    opacity: 0.6,
  },

  // ── SECTIONS ───────────────────────────────────────────────────────────────
  section: {
    marginBottom: SPACING.md,
    borderWidth: BORDERS.width,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    padding: SPACING.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  sectionIndex: {
    fontFamily: TYPOGRAPHY.fontFamilyBold,
    fontSize: TYPOGRAPHY.sizes.xxs,
    color: COLORS.cyan,
    letterSpacing: TYPOGRAPHY.letterSpacing.wide,
    opacity: 0.7,
  },
  sectionLabel: {
    fontFamily: TYPOGRAPHY.fontFamilyBold,
    fontSize: TYPOGRAPHY.sizes.xxs,
    color: COLORS.slateLight,
    letterSpacing: TYPOGRAPHY.letterSpacing.wider,
  },
  sectionHeaderLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.borderDim,
  },

  // ── TERMINAL INPUT ─────────────────────────────────────────────────────────
  terminalInputContainer: {
    borderWidth: BORDERS.widthThick,
    borderColor: COLORS.cyan,
    backgroundColor: COLORS.background,
    padding: SPACING.sm,
    marginBottom: SPACING.sm,
    // Glow effect
    ...GLOW.cyanSubtle,
  },
  terminalPromptRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    minHeight: 72,
  },
  terminalPrompt: {
    fontFamily: TYPOGRAPHY.fontFamilyBold,
    fontSize: TYPOGRAPHY.sizes.md,
    color: COLORS.cyan,
    marginRight: SPACING.sm,
    marginTop: 2,
  },
  terminalInput: {
    flex: 1,
    fontFamily: TYPOGRAPHY.fontFamily,
    fontSize: TYPOGRAPHY.sizes.md,
    color: COLORS.textPrimary,
    padding: 0,
    textDecorationLine: 'none',
    lineHeight: 20,
  },
  cursorIndicator: {
    width: 2,
    height: 18,
    backgroundColor: COLORS.cyan,
    marginTop: 2,
  },

  // ── GENERATE BUTTON ────────────────────────────────────────────────────────
  generateButton: {
    borderWidth: BORDERS.widthThick,
    borderColor: COLORS.cyan,
    paddingVertical: SPACING.sm + 2,
    alignItems: 'center',
    marginBottom: SPACING.md,
    backgroundColor: COLORS.cyanDim,
  },
  generateButtonActive: {
    backgroundColor: COLORS.cyanGlow,
  },
  generateButtonText: {
    fontFamily: TYPOGRAPHY.fontFamilyBold,
    fontSize: TYPOGRAPHY.sizes.sm,
    color: COLORS.cyan,
    letterSpacing: TYPOGRAPHY.letterSpacing.wider,
  },

  // ── FORMULA DISPLAY ────────────────────────────────────────────────────────
  formulaDisplay: {
    borderWidth: BORDERS.width,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    padding: SPACING.sm,
  },
  formulaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginBottom: SPACING.xs,
  },
  formulaDot: {
    width: 4,
    height: 4,
    backgroundColor: COLORS.cyan,
  },
  formulaLabel: {
    fontFamily: TYPOGRAPHY.fontFamily,
    fontSize: TYPOGRAPHY.sizes.xxs,
    color: COLORS.slateDark,
    letterSpacing: TYPOGRAPHY.letterSpacing.wider,
  },
  formulaValue: {
    fontFamily: TYPOGRAPHY.fontFamilyBold,
    fontSize: TYPOGRAPHY.sizes.xl,
    color: COLORS.cyan,
    letterSpacing: TYPOGRAPHY.letterSpacing.normal,
    marginBottom: SPACING.xxs,
  },
  formulaHint: {
    fontFamily: TYPOGRAPHY.fontFamily,
    fontSize: TYPOGRAPHY.sizes.xxs,
    color: COLORS.slateDark,
    letterSpacing: TYPOGRAPHY.letterSpacing.normal,
  },

  // ── MODULE TOGGLES ─────────────────────────────────────────────────────────
  moduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
    borderBottomWidth: BORDERS.width,
    borderBottomColor: COLORS.borderDim,
  },
  moduleRowLast: {
    borderBottomWidth: 0,
    paddingBottom: 0,
  },
  moduleInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flex: 1,
  },
  moduleStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.slateDark,
  },
  moduleStatusDotActive: {
    backgroundColor: COLORS.cyan,
  },
  moduleName: {
    fontFamily: TYPOGRAPHY.fontFamilyBold,
    fontSize: TYPOGRAPHY.sizes.sm,
    color: COLORS.textPrimary,
    letterSpacing: TYPOGRAPHY.letterSpacing.wide,
  },
  moduleDesc: {
    fontFamily: TYPOGRAPHY.fontFamily,
    fontSize: TYPOGRAPHY.sizes.xxs,
    color: COLORS.slateDark,
    letterSpacing: TYPOGRAPHY.letterSpacing.normal,
    marginTop: 1,
  },

  // ── SECURITY PARAMETERS ────────────────────────────────────────────────────
  paramBlock: {
    marginBottom: SPACING.md,
    paddingBottom: SPACING.md,
    borderBottomWidth: BORDERS.width,
    borderBottomColor: COLORS.borderDim,
  },
  paramBlockLast: {
    borderBottomWidth: 0,
    marginBottom: 0,
    paddingBottom: 0,
  },
  paramLabel: {
    fontFamily: TYPOGRAPHY.fontFamilyBold,
    fontSize: TYPOGRAPHY.sizes.xxs,
    color: COLORS.slateLight,
    letterSpacing: TYPOGRAPHY.letterSpacing.wider,
    marginBottom: 2,
  },
  paramHint: {
    fontFamily: TYPOGRAPHY.fontFamily,
    fontSize: TYPOGRAPHY.sizes.xxs,
    color: COLORS.slateDark,
    letterSpacing: TYPOGRAPHY.letterSpacing.normal,
    marginBottom: SPACING.xs,
  },
  paramInput: {
    borderWidth: BORDERS.widthThick,
    borderColor: COLORS.steel,
    padding: SPACING.sm,
    fontFamily: TYPOGRAPHY.fontFamilyBold,
    fontSize: TYPOGRAPHY.sizes.lg,
    color: COLORS.textPrimary,
    backgroundColor: COLORS.background,
    width: 72,
    textAlign: 'center',
  },
  paramInputWide: {
    borderWidth: BORDERS.width,
    borderColor: COLORS.steel,
    padding: SPACING.sm,
    fontFamily: TYPOGRAPHY.fontFamily,
    fontSize: TYPOGRAPHY.sizes.md,
    color: COLORS.textPrimary,
    backgroundColor: COLORS.background,
  },

  // ── ACTION BUTTONS ─────────────────────────────────────────────────────────
  actionSection: {
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  saveButtonWrapper: {
    borderWidth: BORDERS.widthThick,
  },
  saveButton: {
    paddingVertical: SPACING.md,
    alignItems: 'center',
    backgroundColor: COLORS.surfaceElevated,
  },
  saveButtonSuccess: {
    backgroundColor: COLORS.successDim,
  },
  saveButtonError: {
    backgroundColor: COLORS.crimsonDim,
  },
  saveButtonText: {
    fontFamily: TYPOGRAPHY.fontFamilyBold,
    fontSize: TYPOGRAPHY.sizes.sm,
    color: COLORS.textSecondary,  // BUG FIX: was COLORS.crimson — now neutral
    letterSpacing: TYPOGRAPHY.letterSpacing.wider,
  },
  saveButtonTextSuccess: {
    color: COLORS.success,
  },
  saveButtonTextError: {
    color: COLORS.crimson,
  },
  activateButton: {
    borderWidth: BORDERS.widthThick,
    borderColor: COLORS.cyan,
    paddingVertical: SPACING.md + 4,
    alignItems: 'center',
    backgroundColor: COLORS.cyanDim,
    ...GLOW.cyanSubtle,
  },
  activateButtonText: {
    fontFamily: TYPOGRAPHY.fontFamilyBold,
    fontSize: TYPOGRAPHY.sizes.md,
    color: COLORS.cyan,
    letterSpacing: TYPOGRAPHY.letterSpacing.ultraWide,
  },

  // ── FOOTER ─────────────────────────────────────────────────────────────────
  footer: {
    alignItems: 'center',
    marginTop: SPACING.md,
    gap: SPACING.xs,
  },
  footerDivider: {
    width: '40%',
    height: 1,
    backgroundColor: COLORS.borderDim,
    marginBottom: SPACING.xs,
  },
  footerText: {
    fontFamily: TYPOGRAPHY.fontFamily,
    fontSize: TYPOGRAPHY.sizes.xxs,
    color: COLORS.slateDark,
    letterSpacing: TYPOGRAPHY.letterSpacing.wide,
  },
});

export default ConfigScreen;
