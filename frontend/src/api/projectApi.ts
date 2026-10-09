import { apiRequest } from './client';
import { ProjectItem, ProjectDetail, LockedComponent } from '../types/project';

export const projectApi = {
  // 1. 获取所有制作项目列表
  async getAll(): Promise<{ success: boolean; data: ProjectItem[] }> {
    return apiRequest<{ success: boolean; data: ProjectItem[] }>(`/api/projects`);
  },

  // 2. 获取单个项目的完整套料与齐套详情
  async getDetail(id: number): Promise<{ success: boolean; data: ProjectDetail }> {
    return apiRequest<{ success: boolean; data: ProjectDetail }>(`/api/projects/${id}`);
  },

  // 3. 创建项目 (支持直接携带初始套料物料与自动锁库参数)
  async create(
    project: { name: string; description?: string; target_qty?: number; bom_filename?: string },
    items: any[] = [],
    autoLock: boolean = true
  ): Promise<{ success: boolean; data: ProjectDetail }> {
    return apiRequest<{ success: boolean; data: ProjectDetail }>(`/api/projects`, {
      method: 'POST',
      body: JSON.stringify({ project, items, auto_lock: autoLock }),
    });
  },

  // 4. 更新项目基本信息 (如套数、描述、状态)
  async update(id: number, data: Partial<ProjectItem>): Promise<{ success: boolean; data: any }> {
    return apiRequest(`/api/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // 5. 删除项目
  async delete(id: number): Promise<{ success: boolean }> {
    return apiRequest(`/api/projects/${id}`, {
      method: 'DELETE',
    });
  },

  // 6. 往项目添加元器件物料
  async addItem(projectId: number, item: {
    part_name: string;
    package?: string;
    unit_demand_qty: number;
    total_demand_qty?: number;
    component_id?: number | null;
    designators?: string;
  }): Promise<{ success: boolean; data: ProjectDetail }> {
    return apiRequest(`/api/projects/${projectId}/items`, {
      method: 'POST',
      body: JSON.stringify(item),
    });
  },

  // 7. 从项目移除元器件
  async removeItem(projectId: number, itemId: number): Promise<{ success: boolean; data: ProjectDetail }> {
    return apiRequest(`/api/projects/${projectId}/items/${itemId}`, {
      method: 'DELETE',
    });
  },

  // 8. 更新项目元器件用量、封装、规格与关联库存
  async updateItem(projectId: number, itemId: number, data: {
    part_name?: string;
    package?: string;
    unit_demand_qty?: number;
    designators?: string;
    component_id?: number | null;
  }): Promise<{ success: boolean; data: ProjectDetail }> {
    return apiRequest(`/api/projects/${projectId}/items/${itemId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // 8.1 智能寻找工坊可用替代料
  async getAlternatives(projectId: number, itemId: number): Promise<{
    success: boolean;
    data: {
      item: any;
      candidates: any[];
      count: number;
    };
  }> {
    return apiRequest(`/api/projects/${projectId}/items/${itemId}/alternatives`);
  },

  // 9. 一键智能预锁项目现货库存
  async lock(projectId: number): Promise<{ success: boolean; data: ProjectDetail }> {
    return apiRequest(`/api/projects/${projectId}/lock`, {
      method: 'POST',
    });
  },

  // 10. 释放预锁库存 (支持单项或整项目释放)
  async unlock(projectId: number, componentId?: number): Promise<{ success: boolean; data: ProjectDetail }> {
    return apiRequest(`/api/projects/${projectId}/unlock`, {
      method: 'POST',
      body: JSON.stringify({ componentId }),
    });
  },

  // 11. 项目完工投产正式消库
  async complete(projectId: number): Promise<{ success: boolean; data: any }> {
    return apiRequest(`/api/projects/${projectId}/complete`, {
      method: 'POST',
    });
  },

  // 12. 提取项目专属缺料采购清单
  async getPurchaseList(projectId: number): Promise<{
    success: boolean;
    data: {
      projectId: number;
      projectName: string;
      targetQty: number;
      shortages: any[];
      batchOrderText: string;
    };
  }> {
    return apiRequest(`/api/projects/${projectId}/purchase`);
  },

  // 13. 获取项目的锁库物料 (兼容接口)
  async getLockedItems(projectId: number): Promise<{ success: boolean; data: LockedComponent[] }> {
    return apiRequest<{ success: boolean; data: LockedComponent[] }>(`/api/projects/${projectId}/locked-items`);
  },

  async unlockItem(projectId: number, componentId: number) {
    return this.unlock(projectId, componentId);
  }
};
