import { apiRequest } from './client';
import {
  StorageBoxSummary,
  StorageBoxConfig,
  BoxComponentDetail,
  BoxGridResponseData,
  BoxLocatorData,
} from '../types/box';

export const boxApi = {
  // 获取所有收纳盒统计列表 (2.0)
  async getStorageBoxes() {
    const res = await apiRequest<{ success: boolean; data: StorageBoxSummary[] }>(
      `/api/storage-boxes`
    );
    return res;
  },

  // 兼容旧方法：获取所有收纳盒统计列表
  async getAllBoxes() {
    const res = await this.getStorageBoxes();
    if (res.success && Array.isArray(res.data)) {
      const normalized = res.data.map((b) => ({
        ...b,
        totalTypes: b.item_count,
        totalPieces: b.total_quantity,
        lowStockTypes: b.low_stock_count,
        topCategories: b.categories,
      }));
      return { success: true, data: normalized };
    }
    return { success: false, data: [] };
  },

  // 获取某个收纳盒网格详情及格子物料
  async getBoxGrid(idOrName: string | number, page: number = 1) {
    const encoded = encodeURIComponent(String(idOrName));
    return apiRequest<{ success: boolean; data: BoxGridResponseData }>(
      `/api/storage-boxes/${encoded}/grid?page=${page}`
    );
  },

  // 将物料分配到指定收纳盒的格位
  async assignSlot(componentId: number, boxName: string, slot: string) {
    return apiRequest<{ success: boolean; newLocation: string }>(
      `/api/storage-boxes/assign`,
      {
        method: 'POST',
        body: JSON.stringify({
          component_id: componentId,
          box_name: boxName,
          slot,
        }),
      }
    );
  },

  // 将物料从格位移除（保留在盒中或彻底移除）
  async clearSlot(componentId: number, keepInBox: boolean = true) {
    return apiRequest<{ success: boolean; newLocation: string }>(
      `/api/storage-boxes/clear-slot`,
      {
        method: 'POST',
        body: JSON.stringify({
          component_id: componentId,
          keep_in_box: keepInBox,
        }),
      }
    );
  },

  // 保存/更新收纳盒配置
  async saveBoxConfig(config: Partial<StorageBoxConfig>) {
    return apiRequest<{ success: boolean; data: StorageBoxConfig }>(
      `/api/storage-boxes`,
      {
        method: 'POST',
        body: JSON.stringify(config),
      }
    );
  },

  // 删除收纳盒配置
  async deleteBoxConfig(id: number) {
    return apiRequest<{ success: boolean }>(
      `/api/storage-boxes/${id}`,
      {
        method: 'DELETE',
      }
    );
  },

  // 解析与定位仓位 (支持 component_id 或 location 字符串)
  async locateSlot(params: { component_id?: number; location?: string }) {
    const query = new URLSearchParams();
    if (params.component_id) query.set('component_id', String(params.component_id));
    if (params.location) query.set('location', params.location);

    return apiRequest<{ success: boolean; data: BoxLocatorData }>(
      `/api/storage-boxes/locate?${query.toString()}`
    );
  },

  // 兼容旧方法：获取某个收纳盒内的详细物料
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

