import { apiRequest } from './client';
import { StorageBox, BoxComponentDetail } from '../types/box';

export const boxApi = {
  // 获取所有收纳盒统计列表
  async getAllBoxes() {
    const res = await apiRequest<{ success: boolean; data: any[] }>(`/api/boxes`);
    if (res.success && Array.isArray(res.data)) {
      const normalized: StorageBox[] = res.data.map((b) => ({
        name: b.box_name || b.name || '默认收纳盒',
        box_name: b.box_name || b.name,
        totalTypes: b.item_count || b.totalTypes || 0,
        item_count: b.item_count || b.totalTypes || 0,
        totalPieces: b.total_quantity || b.totalPieces || 0,
        total_quantity: b.total_quantity || b.totalPieces || 0,
        lowStockTypes: b.low_stock_count || b.lowStockTypes || 0,
        low_stock_count: b.low_stock_count || b.lowStockTypes || 0,
        topCategories: b.categories_list || b.topCategories || [],
        categories_list: b.categories_list || b.topCategories || [],
        qr_data_url: b.qr_data_url,
      }));
      return { success: true, data: normalized };
    }
    return { success: false, data: [] };
  },

  // 获取某个收纳盒内的详细物料
  async getBoxDetails(location: string) {
    const encoded = encodeURIComponent(location);
    return apiRequest<{ success: boolean; data: BoxComponentDetail[] }>(
      `/api/boxes/items?name=${encoded}`
    );
  },

  // 重命名收纳盒
  async renameBox(oldName: string, newName: string) {
    return apiRequest<{ success: boolean }>(`/api/storage/boxes/rename`, {
      method: 'POST',
      body: JSON.stringify({ oldName, newName }),
    });
  },
};
