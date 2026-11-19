import { createContext, useContext } from 'react';
import type { PublicHotel } from '../../shared/types';

export const HotelContext = createContext<PublicHotel | null>(null);

export function useHotel(): PublicHotel {
  const h = useContext(HotelContext);
  if (!h) throw new Error('useHotel outside HotelContext');
  return h;
}

// The guest's Stay ID is remembered on this device so "My stay" opens straight away.
const KEY = 'stay-code';

export const rememberStay = (code: string) => {
  try {
    localStorage.setItem(KEY, code);
  } catch {
    /* storage can be unavailable in private modes */
  }
};

export const rememberedStay = (): string | null => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

export const forgetStay = () => {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
};
