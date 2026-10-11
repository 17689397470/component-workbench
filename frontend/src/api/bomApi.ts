import { apiRequest, getStoredToken } from './client';
import {
  BomMatchResult,
  BomSummary,
  BomParsedData,
  BomColumnMapping,
  PickListEntry,
  ShortageItem,
  SubstituteRule
} from '../types/bom';

export const bomApi = {
  // 1. 上传并解析 BOM 文件 (Excel / CSV)
  async uploadBomFile(file: File): Promise<{ success: boolean; filename: string; data: BomParsedData }> {
    const formData = new FormData();
    formData.append('bomFile', file);
    const token = getStoredToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch('/api/bom/upload', {
      method: 'POST',
      headers,
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      if (res.status === 401) {
        window.dispatchEvent(new CustomEvent('bom:auth_required'));
      }
      throw new Error(err?.error || 'BOM 文件解析失败');
    }
    return res.json();
  },

  // 2. 剪贴板 / 文本框纯文本秒级解析
  async parseBomText(text: string): Promise<{ success: boolean; data: BomParsedData }> {
    return apiRequest<{ success: boolean; data: BomParsedData }>('/api/bom/parse-text', {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
  },

  // 3. 执行 BOM 与库存比对
  async compareBom(params: {
    rows: any[][];
    mapping: BomColumnMapping;
    multiplier?: number;
    aggregate?: boolean;
    customRules?: SubstituteRule[];
  }): Promise<{
    success: boolean;
    data: {
      summary: BomSummary;
      results: BomMatchResult[];
      pickingList: Record<string, PickListEntry[]>;
      shortageList: ShortageItem[];
      lcscBatchText: string;
      humanReadableListText: string;
      multiplier: number;
      isAggregated: boolean;
    };
  }> {
    return apiRequest('/api/bom/compare', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  // 4. 执行 BOM 现货出库扣减
  async deductBom(items: { id: number; deductQty: number }[], projectId?: number): Promise<{ success: boolean; data: any }> {
    return apiRequest('/api/bom/deduct', {
      method: 'POST',
      body: JSON.stringify({ items, projectId }),
    });
  },

  // 5. 记忆替代偏好规则 CRUD
  async getRules(): Promise<{ success: boolean; data: SubstituteRule[] }> {
    return apiRequest('/api/bom/rules');
  },

  async addRule(rule: {
    target_part: string;
    substitute_part_id?: number | null;
    substitute_name: string;
    note?: string;
  }): Promise<{ success: boolean; data: SubstituteRule }> {
    return apiRequest('/api/bom/rules', {
      method: 'POST',
      body: JSON.stringify(rule),
    });
  },

  async deleteRule(id: number): Promise<{ success: boolean }> {
    return apiRequest(`/api/bom/rules/${id}`, {
      method: 'DELETE',
    });
  },

  // 兼容老调用
  async compareBomFile(file: File) {
    const uploadRes = await this.uploadBomFile(file);
    if (!uploadRes.success || !uploadRes.data) {
      throw new Error('解析文件失败');
    }
    const compareRes = await this.compareBom({
      rows: uploadRes.data.dataRows,
      mapping: uploadRes.data.autoMapping,
      multiplier: 1,
      aggregate: true
    });
    return {
      success: true,
      data: {
        results: compareRes.data.results,
        summary: compareRes.data.summary,
        pickList: Object.values(compareRes.data.pickingList).flat(),
        shortageList: compareRes.data.shortageList
      }
    };
  }
};
