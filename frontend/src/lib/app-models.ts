export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
export const TOKEN_STORAGE_KEY = 'newsoverlay-pro-token';

export const LANDSCAPE_DEFAULTS = {
  logoBg: '#DC2626',
  designationBar: '#1E40AF',
  reporterBar: '#7C3AED',
  crawlerBar: '#EA580C',
  crawlerLine: '#FEF08A',
};

export const PORTRAIT_DEFAULTS = {
  logoBg: '#6B7280',
  designationBar: '#7C3AED',
  reporterBar: '#EA580C',
  crawlerBar: '#16A34A',
  crawlerLine: '#FEF08A',
};

export interface VideoInfo {
  fileName: string;
  originalName: string;
  videoUrl?: string;
  orientation: 'landscape' | 'portrait';
  dimensions: { width: number; height: number };
  duration: number;
}

export interface ColorSettings {
  logoBg: string;
  designationBar: string;
  reporterBar: string;
  crawlerBar: string;
  crawlerLine: string;
}

export type OverlayTextColor = 'white' | 'black';

export interface TextColorSettings {
  designation: OverlayTextColor;
  reporter: OverlayTextColor;
  crawler: OverlayTextColor;
}

export interface OverlaySettings {
  reporterName: string;
  crawlerText: string;
  colors: ColorSettings;
  textColors: TextColorSettings;
  enableIntro: boolean;
  enableOutro: boolean;
}

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  role: 'admin' | 'user';
  logoUrl: string | null;
  introVideoUrl: string | null;
  outroVideoUrl: string | null;
  createdAt: string;
}

export interface LoginFormState {
  username: string;
  password: string;
}

export interface AdminCreateUserState {
  username: string;
  displayName: string;
  password: string;
}

export function createInitialSettings(
  displayName?: string,
  mediaOptions?: { hasIntro?: boolean; hasOutro?: boolean }
): OverlaySettings {
  return {
    reporterName: displayName || 'अनिल मोर्या',
    crawlerText: 'आज की मुख्य हेडलाइंस यहां स्क्रोल होंगी... अपनी ताजा खबरें यहां लिखें...',
    colors: { ...LANDSCAPE_DEFAULTS },
    textColors: {
      designation: 'white',
      reporter: 'white',
      crawler: 'white',
    },
    enableIntro: Boolean(mediaOptions?.hasIntro),
    enableOutro: Boolean(mediaOptions?.hasOutro),
  };
}

export function getErrorMessage(error: any, fallback: string) {
  return error?.response?.data?.error || error?.response?.data?.details || error?.message || fallback;
}
