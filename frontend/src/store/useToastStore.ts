import { create } from 'zustand';

interface ToastState {
  message: string | null;
  type: 'info' | 'success' | 'warn' | 'error';
  visible: boolean;
  showToast: (message: string, type?: 'info' | 'success' | 'warn' | 'error') => void;
  hideToast: () => void;
}

let timer: any = null;

export const useToastStore = create<ToastState>((set) => ({
  message: null,
  type: 'success',
  visible: false,
  showToast: (message, type = 'success') => {
    clearTimeout(timer);
    set({ message, type, visible: true });
    timer = setTimeout(() => {
      set({ visible: false });
    }, 2800);
  },
  hideToast: () => {
    clearTimeout(timer);
    set({ visible: false });
  },
}));
