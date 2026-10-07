import { apiRequest } from './client';
import { ProjectItem, LockedComponent } from '../types/project';

export const projectApi = {
  // 获取所有制作项目
  async getAll() {
    return apiRequest<{ success: boolean; data: ProjectItem[] }>(`/api/projects`);
  },

  // 创建项目
  async create(name: string, description?: string) {
    return apiRequest<{ success: boolean; data: { id: number } }>(`/api/projects`, {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    });
  },

  // 获取项目的锁库物料
  async getLockedItems(projectId: number) {
    return apiRequest<{ success: boolean; data: LockedComponent[] }>(`/api/projects/${projectId}/locked-items`);
  },

  // 释放锁定的物料
  async unlockItem(projectId: number, componentId: number) {
    return apiRequest<{ success: boolean }>(`/api/projects/${projectId}/unlock`, {
      method: 'POST',
      body: JSON.stringify({ componentId }),
    });
  },
};
