import { apiRequest } from './client';
import { ComponentItem, InventoryStats } from '../types/component';

export const componentApi = {
  // 获取全部元器件
  async getAll(params?: { q?: string; category?: string; low_stock?: boolean; location?: string }) {
    const search = new URLSearchParams();
    if (params?.q) search.set('q', params.q);
    if (params?.category) search.set('category', params.category);
    if (params?.low_stock) search.set('low_stock', '1');
    if (params?.location) search.set('location', params.location);
    const query = search.toString() ? `?${search.toString()}` : '';
    return apiRequest<{ success: boolean; data: ComponentItem[] }>(`/api/components${query}`);
  },

  // 获取工坊大盘与分类统计
  async getStats() {
    return apiRequest<{ success: boolean; data: InventoryStats }>(`/api/dashboard/stats`);
  },

  // 获取单个元器件详情
  async getById(id: number) {
    return apiRequest<{ success: boolean; data: ComponentItem }>(`/api/components/${id}`);
  },

  // 数量微调步进 (就地调整)
  async adjustQuantity(id: number, delta: number, note?: string) {
    return apiRequest<{ success: boolean; data: { id: number; quantity: number } }>(
      `/api/components/${id}/adjust`,
      {
        method: 'POST',
        body: JSON.stringify({ change: delta, note }),
      }
    );
  },

  // 创建新物料
  async create(data: Partial<ComponentItem>) {
    return apiRequest<{ success: boolean; data: { id: number } }>(`/api/components`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // 更新物料
  async update(id: number, data: Partial<ComponentItem>) {
    return apiRequest<{ success: boolean; data: { changes: number } }>(`/api/components/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // 删除物料
  async delete(id: number) {
    return apiRequest<{ success: boolean }>(`/api/components/${id}`, {
      method: 'DELETE',
    });
  },

  // 智能文本解析
  async parseText(text: string) {
    return apiRequest<{ success: boolean; data: Partial<ComponentItem> }>(`/api/components/parse`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
  },

  // 官方立创在线参数/图片/品名反查
  async queryOfficial(text: string) {
    return apiRequest<{ success: boolean; data: any }>(`/api/components/query-official`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
  },

  // 自由多行文本智能拆解与防重检测
  async parseBatch(text: string) {
    return apiRequest<{ success: boolean; count: number; items: any[] }>(`/api/components/parse-batch`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
  },

  // 批量入库
  async batchAdd(items: any[]) {
    return apiRequest<{ success: boolean; data: any }>(`/api/components/batch-add`, {
      method: 'POST',
      body: JSON.stringify({ items }),
    });
  },

  // 常用收纳盒推荐
  async getFrequentLocations() {
    return apiRequest<{ success: boolean; data: string[] }>(`/api/locations/frequent`);
  },

  // 预设快捷导入
  async seedPresets() {
    return apiRequest<{ success: boolean; data: { count: number } }>(`/api/presets/seed`, {
      method: 'POST',
    });
  },
};
