// AegisLock — Central Design Token Registry

export const COLORS = {
  background: '#000000',
  surface: '#050A14',
  surfaceElevated: '#0A0F1E',
  surfaceHigh: '#0F1829',
  steel: '#1E3A5F',
  steelLight: '#2A4A72',
  cyan: '#00D4FF',
  cyanBright: '#33DDFF',
  cyanDim: 'rgba(0, 212, 255, 0.12)',
  cyanGlow: 'rgba(0, 212, 255, 0.25)',
  cyanGlowStrong: 'rgba(0, 212, 255, 0.45)',
  slate: '#8B9BB4',
  slateLight: '#A8B8CC',
  slateDark: '#4A5A72',
  crimson: '#FF2D55',
  crimsonBright: '#FF5577',
  crimsonDim: 'rgba(255, 45, 85, 0.12)',
  crimsonGlow: 'rgba(255, 45, 85, 0.35)',
  success: '#00FF88',
  successDim: 'rgba(0, 255, 136, 0.12)',
  successGlow: 'rgba(0, 255, 136, 0.35)',
  warning: '#FFB800',
  warningDim: 'rgba(255, 184, 0, 0.12)',
  scanline: 'rgba(255, 255, 255, 0.025)',
  gridLine: 'rgba(0, 212, 255, 0.04)',
  textPrimary: '#E8EEFF',
  textSecondary: '#A8B8CC',
  border: '#1E3A5F',
  borderActive: '#00D4FF',
  borderDim: '#0F1E33',
  online: '#00FF88',
  offline: '#FF2D55',
  standby: '#FFB800',
};

export const TYPOGRAPHY = {
  fontFamily: 'JetBrainsMono-Regular',
  fontFamilyBold: 'JetBrainsMono-Bold',
  sizes: {
    xxs: 9,
    xs: 10,
    sm: 12,
    md: 14,
    lg: 18,
    xl: 24,
    xxl: 28,
    display: 34,
    hero: 48,
  },
  letterSpacing: {
    tight: 0,
    normal: 0.5,
    wide: 1.5,
    wider: 2.5,
    ultraWide: 4,
  },
};

export const SPACING = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
};

export const BORDERS = {
  width: 1,
  widthThick: 2,
  radius: 2,
  radiusSm: 1,
};

export const ANIMATION = {
  flickerInterval: 80,
  flickerIntervalSlow: 120,
  pulseDuration: 1400,
  pulseDurationFast: 800,
  pressOpacity: 0.55,
  glowDuration: 2000,
};

// Shadow/glow elevation levels for elevated surfaces
export const GLOW = {
  cyan: {
    shadowColor: '#00D4FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 8,
  },
  cyanSubtle: {
    shadowColor: '#00D4FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  crimson: {
    shadowColor: '#FF2D55',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 8,
  },
  success: {
    shadowColor: '#00FF88',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 6,
  },
};

export const GRID = {
  cellSize: 32,
  lineOpacity: 0.04,
};
