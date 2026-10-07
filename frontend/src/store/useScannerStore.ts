import { create } from 'zustand';
import { ScanResolveResponse } from '../api/scanApi';

interface ScannerState {
  isOpen: boolean;
  torchOn: boolean;
  scanCount: number;
  activeSheet: ScanResolveResponse | null;
  sheetTimerProgress: number; // 0 到 100%
  isLocked: boolean;

  openScanner: () => void;
  closeScanner: () => void;
  setTorchOn: (on: boolean) => void;
  toggleTorch: () => void;
  incrementScanCount: () => void;
  setActiveSheet: (sheet: ScanResolveResponse | null) => void;
  setSheetTimerProgress: (p: number) => void;
  setIsLocked: (locked: boolean) => void;
}

export const useScannerStore = create<ScannerState>((set) => ({
  isOpen: false,
  torchOn: false,
  scanCount: 0,
  activeSheet: null,
  sheetTimerProgress: 0,
  isLocked: false,

  openScanner: () => set({ isOpen: true }),
  closeScanner: () => set({ isOpen: false, activeSheet: null, torchOn: false }),
  setTorchOn: (on) => set({ torchOn: on }),
  toggleTorch: () => set((s) => ({ torchOn: !s.torchOn })),
  incrementScanCount: () => set((s) => ({ scanCount: s.scanCount + 1 })),
  setActiveSheet: (sheet) => set({ activeSheet: sheet }),
  setSheetTimerProgress: (p) => set({ sheetTimerProgress: p }),
  setIsLocked: (locked) => set({ isLocked: locked }),
}));
