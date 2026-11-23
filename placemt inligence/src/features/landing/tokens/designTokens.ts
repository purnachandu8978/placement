/**
 * Placement Intelligence — Design System Tokens
 * Master visual design tokens for the premium isometric placement ecosystem.
 */

export const colors = {
  bg: {
    pure: '#FFFFFF',
    cream: '#FAFAF8',
    subtle: '#F8F9FC',
    peachTint: '#FFF9F5',
    peachSoft: '#FFF0E4',
    darkNavy: '#0F172A',
  },
  text: {
    primary: '#111827',
    navyHeading: '#172235',
    secondary: '#64748B',
    muted: '#94A3B8',
    inverse: '#FFFFFF',
  },
  brand: {
    orangePrimary: '#F97316',
    orangeDeep: '#EA580C',
    orangeLight: '#FB923C',
    peach: '#FFF0E4',
    orangeGradient: 'linear-gradient(135deg, #F97316 0%, #EA580C 100%)',
    peachGradient: 'linear-gradient(180deg, #FFFFFF 0%, #FFF0E4 100%)',
  },
  support: {
    green: '#22A06B',
    greenLight: '#DCFCE7',
    blue: '#5277D7',
    blueLight: '#EFF6FF',
    amber: '#F59E0B',
    amberLight: '#FEF3C7',
    purple: '#8B5CF6',
  },
  border: {
    subtle: '#E8EAF0',
    peachSubtle: '#FFE5D6',
    activeOrange: '#FDBA74',
  },
  glass: {
    card: 'rgba(255, 255, 255, 0.92)',
    cardHover: 'rgba(255, 255, 255, 0.98)',
    header: 'rgba(255, 255, 255, 0.82)',
  },
} as const;

export const shadows = {
  soft: '0 8px 30px rgba(17, 24, 39, 0.04)',
  elevated: '0 16px 40px -10px rgba(17, 24, 39, 0.08), 0 0 1px 1px rgba(232, 234, 240, 0.8)',
  isometricGround: '0 40px 70px -15px rgba(17, 24, 39, 0.12), 0 10px 20px -5px rgba(249, 115, 22, 0.05)',
  floatingCard: '0 25px 50px -12px rgba(17, 24, 39, 0.14), 0 0 0 1px rgba(255, 255, 255, 0.8)',
  capsuleNav: '0 10px 30px -5px rgba(17, 24, 39, 0.06), 0 0 0 1px rgba(232, 234, 240, 0.8)',
  glowOrange: '0 0 35px rgba(249, 115, 22, 0.22)',
} as const;

export const typography = {
  heroHeading: 'text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.08]',
  sectionHeading: 'text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold tracking-tight text-slate-900 leading-tight',
  sectionSubtitle: 'text-sm sm:text-base md:text-lg text-slate-600 max-w-2xl leading-relaxed',
  cardTitle: 'text-base sm:text-lg font-bold text-slate-900 tracking-tight',
  bodyText: 'text-sm text-slate-600 leading-relaxed',
  badgeText: 'text-[11px] font-bold tracking-wider uppercase',
} as const;

export const transitions = {
  spring: 'transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
  gentle: 'transition-all duration-500 ease-out',
} as const;
