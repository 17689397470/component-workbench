import { apiRequest } from './client';
import { StorageBox, BoxComponentDetail } from '../types/box';

export const boxApi = {
  // 获取所有收纳盒统计列表
  async getAllBoxes() {
    return apiRequest<{ success: boolean; data: StorageBox[] }>(`/api/storage/boxes`);
  },

  // 获取某个收纳盒内的详细物料
  async getBoxDetails(location: string) {
    const encoded = encodeURIComponent(location);
    return apiRequest<{ success: boolean; data: BoxComponentDetail[] }>(`/api/storage/boxes/${encoded}`);
  },

  // 重命名收纳盒
  async renameBox(oldName: string, newName: string) {
    return apiRequest<{ success: boolean }>(`/api/storage/boxes/rename`, {
      method: 'POST',
      body: JSON.stringify({ oldName, newName }),
    });
  },
};
