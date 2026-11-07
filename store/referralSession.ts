/**
 * The referral partner the referral flow is currently billing for.
 *
 * Persisted, so the Referral tab stays unlocked until the owner changes it.
 * Bills generated in the referral flow are credited to this partner and 10%
 * of each bill is counted as their earning.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ReferralOwner } from '../types';

interface ReferralSessionState {
  active: ReferralOwner | null;
  setActive: (owner: ReferralOwner) => void;
  clearActive: () => void;
}

export const useReferralSession = create<ReferralSessionState>()(
  persist(
    (set) => ({
      active: null,
      setActive: (owner) => set({ active: owner }),
      clearActive: () => set({ active: null }),
    }),
    {
      name: 'herbeco-active-referral',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
