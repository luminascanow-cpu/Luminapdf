export const Palette = {
  primary: '#4647d3',
  primaryContainer: '#9396ff',
  primaryDim: '#3939c7',
  onPrimary: '#f4f1ff',
  
  secondary: '#b80438',
  secondaryContainer: '#ffc2c5',
  onSecondary: '#ffefef',
  
  tertiary: '#904800',
  tertiaryContainer: '#ff9742',
  onTertiary: '#fff0e8',
  tertiaryFixed: '#ff9742',
  
  background: '#f6f6ff',
  surface: '#f6f6ff',
  surfaceContainerLow: '#eef0ff',
  surfaceContainerLowest: '#ffffff',
  surfaceContainerHigh: '#d9e2ff',
  surfaceVariant: '#d1dcff',
  
  onSurface: '#272e42',
  onSurfaceVariant: '#535b71',
  outline: '#6f768e',
  outlineVariant: '#a5adc6', // Rule: Use at 15% opacity (#a5adc626)
  
  error: '#b41340',
  onError: '#ffefef',
};

export const Gradients = {
  primary: ['#4647d3', '#9396ff'],
  accent: ['#b80438', '#ff9742'],
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const Radius = {
  default: 4,
  lg: 8,
  xl: 12, // 0.75rem
  xxl: 16, // 1rem
  xxxl: 24, // 1.5rem (3xl in design system)
  full: 9999,
};

export const Shadows = {
  ambient: {
    shadowColor: Palette.onSurface,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 24,
    elevation: 4,
  },
  accent: {
    shadowColor: Palette.secondary,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 32,
    elevation: 8,
  }
};
