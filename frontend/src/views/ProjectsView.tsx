import React, { useEffect, useState } from 'react';
import { projectApi } from '../api/projectApi';
import { ProjectItem, LockedComponent } from '../types/project';
import { useToastStore } from '../store/useToastStore';
import { Hammer, Plus, Lock, Unlock, FolderGit2 } from 'lucide-react';
import { Modal } from '../components/ui/Modal';

export const ProjectsView: React.FC = () => {
  const { showToast } = useToastStore();
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(false);

  // 新建项目弹窗
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectDesc, setProjectDesc] = useState('');

  // 选中的项目锁定明细
  const [selectedProject, setSelectedProject] = useState<ProjectItem | null>(null);
  const [lockedItems, setLockedItems] = useState<LockedComponent[]>([]);

  const fetchProjects = async () => {
    setLoading(true);
    try {
      const res = await projectApi.getAll();
      if (res.success && res.data) {
        setProjects(res.data);
      }
    } catch (err: any) {
      showToast('获取项目列表失败: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleCreate = async () => {
    if (!projectName.trim()) {
      showToast('请输入项目名称', 'warn');
      return;
    }
    try {
      await projectApi.create(projectName.trim(), projectDesc.trim());
      showToast('✔ 成功创建项目', 'success');
      setProjectName('');
      setProjectDesc('');
      setCreateModalOpen(false);
      fetchProjects();
    } catch (err: any) {
      showToast('创建项目失败: ' + err.message, 'error');
    }
  };

  const handleViewLocked = async (proj: ProjectItem) => {
    setSelectedProject(proj);
    try {
      const res = await projectApi.getLockedItems(proj.id);
      if (res.success && res.data) {
        setLockedItems(res.data);
      }
    } catch (err: any) {
      showToast('获取锁库明细失败: ' + err.message, 'error');
    }
  };

  const handleUnlock = async (componentId: number) => {
    if (!selectedProject) return;
    try {
      await projectApi.unlockItem(selectedProject.id, componentId);
      showToast('已释放物料锁定', 'success');
      // 重新拉取
      handleViewLocked(selectedProject);
      fetchProjects();
    } catch (err: any) {
      showToast('释放失败: ' + err.message, 'error');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-text-main flex items-center gap-2">
            <Hammer className="w-5 h-5 text-accent" />
            <span>制作项目与物料锁定</span>
          </h1>
          <p className="text-xs text-text-muted mt-0.5">
            为正在打板、焊接的项目预先锁定现货库存，杜绝备料被日常消耗挪用。
          </p>
        </div>

        <button
          type="button"
          onClick={() => setCreateModalOpen(true)}
          className="flex items-center gap-1.5 px-3.5 py-1.5 bg-text-main text-surface rounded-full text-xs font-semibold shadow-sm hover:opacity-90 active:scale-95 transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>新建制作项目</span>
        </button>
      </div>

      {loading ? (
        <div className="py-24 text-center text-xs text-text-dim">正在加载项目...</div>
      ) : projects.length === 0 ? (
        <div className="py-16 text-center text-sm text-text-dim bg-surface border border-dashed border-border-subtle rounded-2xl">
          暂无活动项目。点击右上角「新建制作项目」，可在 BOM 对账时一键为项目锁定库存。
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((proj) => (
            <div
              key={proj.id}
              onClick={() => handleViewLocked(proj)}
              className="bg-surface border border-border-subtle hover:border-border-hover rounded-2xl p-4 shadow-sm hover:shadow-md cursor-pointer transition-all flex flex-col justify-between group"
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="font-bold text-sm text-text-main group-hover:text-accent transition-colors flex items-center gap-2">
                    <FolderGit2 className="w-4 h-4 text-accent" />
                    <span>{proj.name}</span>
                  </div>
                  <span className="text-[10px] text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 font-medium">
                    进行中
                  </span>
                </div>
                <p className="text-xs text-text-muted line-clamp-2 mb-3">
                  {proj.description || '暂无描述说明'}
                </p>
              </div>

              <div className="pt-3 border-t border-dashed border-border-subtle flex items-center justify-between text-xs text-text-dim">
                <span className="flex items-center gap-1">
                  <Lock className="w-3 h-3 text-amber-500" />
                  <span>已锁库物料: <strong>{proj.lockedCount || 0}</strong> 项</span>
                </span>
                <span>{new Date(proj.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 新建项目模态框 */}
      <Modal isOpen={createModalOpen} onClose={() => setCreateModalOpen(false)} title="新建制作项目" maxWidth="max-w-md">
        <div className="space-y-4 text-xs">
          <div>
            <label className="block text-text-dim mb-1 font-medium">项目名称 *</label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="例如: ESP32-S3 智能墨水屏时钟 v1.0"
              className="w-full bg-surface border border-border-subtle rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-text-dim mb-1 font-medium">项目说明 / 目标</label>
            <textarea
              rows={3}
              value={projectDesc}
              onChange={(e) => setProjectDesc(e.target.value)}
              placeholder="记录 PCB 版本、嘉立创打板批次或技术要点..."
              className="w-full bg-surface border border-border-subtle rounded-xl p-3 text-xs focus:outline-none focus:border-accent resize-none"
            />
          </div>
          <button
            type="button"
            onClick={handleCreate}
            className="w-full py-2.5 bg-accent text-white font-semibold text-xs rounded-xl shadow-sm hover:opacity-90 transition-all"
          >
            确认创建
          </button>
        </div>
      </Modal>

      {/* 锁库物料明细模态框 */}
      <Modal
        isOpen={!!selectedProject}
        onClose={() => setSelectedProject(null)}
        title={`🔒 ${selectedProject?.name || ''} - 锁库物料`}
        maxWidth="max-w-xl"
      >
        {lockedItems.length === 0 ? (
          <div className="py-12 text-center text-xs text-text-dim">
            该项目当前尚未锁定任何物料。在「BOM 比对」页面执行拣料时可选择一键为该项目锁库。
          </div>
        ) : (
          <div className="space-y-2.5 text-xs max-h-[60vh] overflow-y-auto">
            {lockedItems.map((item) => (
              <div
                key={item.id}
                className="p-3 bg-canvas border border-border-subtle rounded-xl flex items-center justify-between"
              >
                <div>
                  <div className="font-semibold text-text-main">{item.name}</div>
                  <div className="text-[11px] text-text-dim mt-0.5">
                    {item.package || '-'} · {item.value || '-'} · 存放: {item.location}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="text-[10px] text-text-dim">锁定: </span>
                    <strong className="font-mono text-amber-600 font-bold">{item.locked_quantity}</strong>
                    <span className="text-[10px] text-text-dim"> 件</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleUnlock(item.component_id)}
                    className="p-1.5 rounded-lg bg-subtle hover:bg-rose-50 text-text-muted hover:text-rose-600 transition-colors"
                    title="释放该项锁定"
                  >
                    <Unlock className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
};
