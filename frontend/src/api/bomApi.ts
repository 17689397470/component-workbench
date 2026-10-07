import { apiRequest } from './client';
import { BomMatchResult, BomSummary, PickListItem } from '../types/bom';

export const bomApi = {
  // 解析并比对 BOM 文件
  async compareBomFile(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/bom/compare', {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.error || 'BOM 比对请求失败');
    }
    return res.json() as Promise<{
      success: boolean;
      data: {
        results: BomMatchResult[];
        summary: BomSummary;
        pickList: PickListItem[];
        shortageList: any[];
      };
    }>;
  },

  // 采纳替代物料
  async adoptSubstitute(bomIndex: number, substituteId: number) {
    return apiRequest<{ success: boolean }>(`/api/bom/adopt-substitute`, {
      method: 'POST',
      body: JSON.stringify({ bomIndex, substituteId }),
    });
  },

  // 执行 BOM 扣减出库
  async deductBom(items: { componentId: number; quantity: number }[], projectId?: number) {
    return apiRequest<{ success: boolean; data: any }>(`/api/bom/deduct`, {
      method: 'POST',
      body: JSON.stringify({ items, projectId }),
    });
  },
};
