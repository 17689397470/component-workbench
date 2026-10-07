import { apiRequest } from './client';
import { ComponentItem } from '../types/component';

export interface ScanResolveResponse {
  success: boolean;
  data: Partial<ComponentItem>;
  isExisting: boolean;
  existingItem?: ComponentItem;
  targetLocation: string;
  scanType: 'qrcode' | 'ocr' | 'text';
  rawText: string;
}

export const scanApi = {
  async resolveScan(rawText: string, scanType: 'qrcode' | 'ocr' | 'text' = 'qrcode') {
    return apiRequest<ScanResolveResponse>(`/api/scan/resolve`, {
      method: 'POST',
      body: JSON.stringify({ rawText, scanType }),
    });
  },
};
