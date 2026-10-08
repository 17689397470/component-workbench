import React, { useEffect, useState } from 'react';
import { projectApi } from '../api/projectApi';
import { ProjectItem } from '../types/project';
import { useToastStore } from '../store/useToastStore';
import { ProjectDetailModal } from '../components/ProjectDetailModal';
import { AddProjectItemModal } from '../components/AddProjectItemModal';
import { Hammer, Plus, Lock, FolderGit2, Layers, Calendar, ChevronRight } from 'lucide-react';
import { Modal } from '../components/ui/Modal';
import { cn } from '../lib/utils';

export const ProjectsView: React.FC = () => {
  const { showToast } = useToastStore();
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(false);

  // 新建项目弹窗
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectDesc, setProjectDesc] = useState('');
  const [targetQty, setTargetQty] = useState<number>(1);

  // 选中的项目详情弹窗与直接加料弹窗
  const [activeProjectId, setActiveProjectId] = useState<number | null>(null);
  const [addMaterialProject, setAddMaterialProject] = useState<ProjectItem | null>(null);

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
      const res = await projectApi.create({
        name: projectName.trim(),
        description: projectDesc.trim(),
        target_qty: Math.max(1, targetQty),
      });
      showToast('✔ 成功创建项目！可立即添加物料。', 'success');
      const createdProj = res.data;
      setProjectName('');
      setProjectDesc('');
      setTargetQty(1);
      setCreateModalOpen(false);
      fetchProjects();
      // 创建成功后自动打开该项目的物料添加弹窗
      if (createdProj && createdProj.id) {
        setAddMaterialProject(createdProj);
      }
    } catch (err: any) {
      showToast('创建项目失败: ' + err.message, 'error');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 space-y-5">
      {/* 顶部标题区与新建按钮 */}
      <div className="flex items-center justify-between gap-4 flex-wrap pb-2 border-b border-border-subtle">
        <div>
          <h1 className="text-lg font-bold text-text-main flex items-center gap-2">
            <Hammer className="w-5 h-5 text-accent" />
            <span>制作项目与套料包管理</span>
          </h1>
          <p className="text-xs text-text-muted mt-0.5">
            为正在打板、焊接的项目预排专属元器件套料包与预锁库，防止现货备料被日常消耗挪用。
          </p>
        </div>

        <button
          type="button"
          onClick={() => setCreateModalOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-xl text-xs font-semibold shadow-sm transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>新建制作项目</span>
        </button>
      </div>

      {/* 项目列表网格 */}
      {loading ? (
        <div className="py-24 text-center text-xs text-text-dim">正在加载制作项目...</div>
      ) : projects.length === 0 ? (
        <div className="py-20 text-center text-xs text-text-dim bg-surface border border-dashed border-border-subtle rounded-2xl space-y-3">
          <div>暂无正在进行的制作项目。点击右上角新建项目，或在「BOM 比对」页面一键转存！</div>
          <button
            type="button"
            onClick={() => setCreateModalOpen(true)}
            className="px-4 py-2 bg-accent text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>现在新建首个项目</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((proj) => {
            const readiness = proj.readinessPercent || 0;
            const isCompleted = proj.status === 'COMPLETED';

            return (
              <div
                key={proj.id}
                onClick={() => setActiveProjectId(proj.id)}
                className="bg-surface border border-border-subtle hover:border-accent hover:shadow-md rounded-2xl p-5 cursor-pointer transition-all flex flex-col justify-between group space-y-4"
              >
                <div>
                  {/* 项目名称与状态徽标 */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-bold text-sm text-text-main group-hover:text-accent transition-colors flex items-center gap-2">
                      <FolderGit2 className="w-4 h-4 text-accent" />
                      <span className="truncate">{proj.name}</span>
                    </div>

                    {isCompleted ? (
                      <span className="text-[10px] text-emerald-700 bg-emerald-500/15 px-2 py-0.5 rounded-full border border-emerald-500/30 font-bold shrink-0">
                        已完工消库
                      </span>
                    ) : readiness >= 100 ? (
                      <span className="text-[10px] text-emerald-700 bg-emerald-500/15 px-2 py-0.5 rounded-full border border-emerald-500/30 font-bold shrink-0">
                        齐套待焊
                      </span>
                    ) : (
                      <span className="text-[10px] text-amber-700 bg-amber-500/15 px-2 py-0.5 rounded-full border border-amber-500/30 font-bold shrink-0">
                        备料中
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-text-muted line-clamp-2 mb-3">
                    {proj.description || '暂无项目说明'}
                  </p>

                  {/* 齐套率进度条 */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-text-dim flex items-center gap-1">
                        <Layers className="w-3 h-3 text-accent" />
                        <span>齐套率: {proj.ready_items_count || 0} / {proj.total_items_count || 0} 项</span>
                      </span>
                      <span className={cn('font-mono font-bold', readiness >= 100 ? 'text-emerald-600' : 'text-accent')}>
                        {readiness}%
                      </span>
                    </div>
                    <div className="w-full bg-subtle rounded-full h-2 overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-all', readiness >= 100 ? 'bg-emerald-500' : 'bg-accent')}
                        style={{ width: `${Math.min(100, readiness)}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* 卡片底栏：套数、已锁数量与醒目的快捷操作按钮 */}
                <div className="pt-3 border-t border-border-subtle flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs text-text-dim">
                    <span className="font-mono text-text-main font-bold">x{proj.target_qty || 1} 套</span>
                    <span>·</span>
                    <span className="text-amber-600 font-mono flex items-center gap-0.5" title="已锁库现货件数">
                      <Lock className="w-3 h-3" />
                      <span>{proj.totalPiecesLocked || proj.lockedCount || 0} 件</span>
                    </span>
                  </div>

                  {/* 显式的快捷操作按钮 */}
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setAddMaterialProject(proj);
                      }}
                      className="px-2.5 py-1 bg-accent hover:bg-accent-hover text-white rounded-lg text-xs font-semibold flex items-center gap-1 shadow-sm transition-all"
                      title="往该项目添加元器件物料"
                    >
                      <Plus className="w-3 h-3" />
                      <span>添加物料</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveProjectId(proj.id);
                      }}
                      className="px-2.5 py-1 bg-subtle hover:bg-surface-hover border border-border-subtle text-text-main rounded-lg text-xs font-medium flex items-center gap-1 transition-all"
                      title="打开项目完整套料清单"
                    >
                      <span>查看套料</span>
                      <ChevronRight className="w-3 h-3 text-text-dim" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
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
              autoFocus
            />
          </div>

          <div>
            <label className="block text-text-dim mb-1 font-medium">制作目标套数 (板)</label>
            <input
              type="number"
              min={1}
              value={targetQty}
              onChange={(e) => setTargetQty(parseInt(e.target.value, 10) || 1)}
              placeholder="打样/制作套数 (默认 1)"
              className="w-full bg-surface border border-border-subtle rounded-xl px-3 py-2 text-xs font-mono font-bold focus:outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="block text-text-dim mb-1 font-medium">项目说明 / 目标</label>
            <textarea
              rows={3}
              value={projectDesc}
              onChange={(e) => setProjectDesc(e.target.value)}
              placeholder="记录 PCB 版本、嘉立创打板批次或关键技术参数..."
              className="w-full bg-surface border border-border-subtle rounded-xl p-3 text-xs focus:outline-none focus:border-accent resize-none"
            />
          </div>

          <button
            type="button"
            onClick={handleCreate}
            className="w-full py-2.5 bg-accent hover:bg-accent-hover text-white font-semibold text-xs rounded-xl shadow-sm transition-all"
          >
            确认创建并开始加料
          </button>
        </div>
      </Modal>

      {/* 从卡片直接打开的添加物料弹窗 */}
      {addMaterialProject && (
        <AddProjectItemModal
          isOpen={!!addMaterialProject}
          onClose={() => setAddMaterialProject(null)}
          projectId={addMaterialProject.id}
          projectTargetQty={addMaterialProject.target_qty || 1}
          onSuccess={fetchProjects}
        />
      )}

      {/* 项目详情与完整套料看板弹窗 */}
      <ProjectDetailModal
        isOpen={!!activeProjectId}
        onClose={() => setActiveProjectId(null)}
        projectId={activeProjectId}
        onProjectUpdated={fetchProjects}
      />
    </div>
  );
};
