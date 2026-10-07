import { apiRequest } from './client';
import { DatabaseSnapshot } from '../types/backup';

export const backupApi = {
  // 获取本地快照列表
  async getSnapshots() {
    return apiRequest<{ success: boolean; data: DatabaseSnapshot[] }>(`/api/backup/snapshots`);
  },

  // 创建手动快照
  async createSnapshot(reason: string = 'manual') {
    return apiRequest<{ success: boolean; filename: string }>(`/api/backup/snapshots/create`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  // 一键回滚到指定快照
  async rollback(filename: string) {
    return apiRequest<{ success: boolean; preRollbackSnapshot: string }>(`/api/backup/snapshots/rollback`, {
      method: 'POST',
      body: JSON.stringify({ filename }),
    });
  },

  // 导入全量 JSON 备份
  async restoreBackup(backupData: any) {
    return apiRequest<{ success: boolean; preRestoreSnapshot: string; counts: any }>(`/api/backup/restore`, {
      method: 'POST',
      body: JSON.stringify({ backupData }),
    });
  },
};
