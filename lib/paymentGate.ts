import { getExportedDocumentsCount, isPaymentUnlocked } from './storage';

export const FREE_SCAN_LIMIT = 5;
export const FREE_PAGE_LIMIT = 3;
export const ONE_TIME_PAYMENT_LABEL = 'Rs 299';

export interface UsageGateState {
  isUnlocked: boolean;
  usedFreeScans: number;
  remainingFreeScans: number;
  freeScanLimit: number;
  freePageLimit: number;
}

export const getUsageGateState = async (): Promise<UsageGateState> => {
  const [unlocked, exportedCount] = await Promise.all([
    isPaymentUnlocked(),
    getExportedDocumentsCount(),
  ]);

  const usedFreeScans = unlocked ? exportedCount : Math.min(exportedCount, FREE_SCAN_LIMIT);

  return {
    isUnlocked: unlocked,
    usedFreeScans,
    remainingFreeScans: unlocked ? 0 : Math.max(0, FREE_SCAN_LIMIT - exportedCount),
    freeScanLimit: FREE_SCAN_LIMIT,
    freePageLimit: FREE_PAGE_LIMIT,
  };
};

export const canStartNewScan = async () => {
  const state = await getUsageGateState();
  return state.isUnlocked || state.usedFreeScans < state.freeScanLimit;
};

export const canUsePageCount = async (pageCount: number) => {
  const state = await getUsageGateState();
  return state.isUnlocked || pageCount <= state.freePageLimit;
};
