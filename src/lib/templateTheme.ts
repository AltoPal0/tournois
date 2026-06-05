import type { PlayerTemplate } from '../types/tournament'

export interface TemplateTheme {
  bg: string
  gradient: string
  accent: string
  accentText: string
  textPrimary: string
  textSecondary: string
  textMuted: string
  inputBg: string
  itemBg: string
  itemBgActive: string
  divider: string
  useClip: boolean
}

const THEMES: Record<PlayerTemplate, TemplateTheme> = {
  'slick-dark': {
    bg: '#062E38',
    gradient: 'linear-gradient(135deg, #01344C 0%, #0B5A78 100%)',
    accent: '#D4E800',
    accentText: '#062E38',
    textPrimary: 'rgba(255,255,255,1)',
    textSecondary: 'rgba(255,255,255,0.5)',
    textMuted: 'rgba(255,255,255,0.3)',
    inputBg: 'rgba(255,255,255,0.1)',
    itemBg: 'rgba(255,255,255,0.07)',
    itemBgActive: '#0A4E5C',
    divider: 'rgba(255,255,255,0.1)',
    useClip: true,
  },
  'palm-springs': {
    bg: '#6B3020',
    gradient: 'linear-gradient(135deg, #7A3B28 0%, #5A2515 100%)',
    accent: '#E8C9A0',
    accentText: '#5A2515',
    textPrimary: 'rgba(232,201,160,1)',
    textSecondary: 'rgba(232,201,160,0.6)',
    textMuted: 'rgba(232,201,160,0.35)',
    inputBg: 'rgba(255,255,255,0.08)',
    itemBg: 'rgba(255,255,255,0.06)',
    itemBgActive: 'rgba(232,201,160,0.2)',
    divider: 'rgba(255,255,255,0.1)',
    useClip: false,
  },
  'green-turf': {
    bg: '#8C2D40',
    gradient: 'linear-gradient(135deg, #B23A54 0%, #7A2438 100%)',
    accent: '#FFF1E8',
    accentText: '#8C2D40',
    textPrimary: 'rgba(255,241,232,1)',
    textSecondary: 'rgba(255,241,232,0.55)',
    textMuted: 'rgba(255,241,232,0.3)',
    inputBg: 'rgba(255,255,255,0.08)',
    itemBg: 'rgba(255,255,255,0.06)',
    itemBgActive: 'rgba(255,241,232,0.15)',
    divider: 'rgba(255,255,255,0.1)',
    useClip: false,
  },
  'default': {
    bg: '#0F172A',
    gradient: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
    accent: '#F4B942',
    accentText: '#0F172A',
    textPrimary: 'rgba(255,255,255,1)',
    textSecondary: 'rgba(255,255,255,0.5)',
    textMuted: 'rgba(255,255,255,0.3)',
    inputBg: 'rgba(255,255,255,0.08)',
    itemBg: 'rgba(255,255,255,0.07)',
    itemBgActive: 'rgba(244,185,66,0.15)',
    divider: 'rgba(255,255,255,0.1)',
    useClip: false,
  },
}

export function getTheme(template?: PlayerTemplate): TemplateTheme {
  return THEMES[template ?? 'default']
}
