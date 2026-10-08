import React, { useEffect, useState, useMemo } from 'react';
import { projectApi } from '../api/projectApi';
import { ProjectItem } from '../types/project';
import { useToastStore } from '../store/useToastStore';
import { ProjectWorkspace } from '../components/projects/ProjectWorkspace';
import {
  Hammer,
  Plus,
  Lock,
  FolderGit2,
  Layers,
  Calendar,
  ChevronRight,
  Search,
  Trash2,
  CheckCircle2,
} from 'lucide-react';
import { Modal } from '../components/ui/Modal';
import { cn } from '../lib/utils';

export const ProjectsView: React.FC = () => {
  const { showToast } = useToastStore();
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(false);

  // 搜索与状态过滤
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PREPARING' | 'READY' | 'COMPLETED'>('ALL');

  // 当前主工作台选中的项目
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);

  // 移动端视图模式：'LIST' 列表模式 或 'WORKSPACE' 工作台模式
  const [mobileViewMode, setMobileViewMode] = useState<'LIST' | 'WORKSPACE'>('LIST');

  // 新建项目弹窗
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectDesc, setProjectDesc] = useState('');
  const [targetQty, setTargetQty] = useState<number>(1);

  const fetchProjects = async (maintainSelectedId?: number) => {
    setLoading(true);
    try {
      const res = await projectApi.getAll();
      if (res.success && res.data) {
        setProjects(res.data);
        if (res.data.length > 0) {
          const targetId = maintainSelectedId || selectedProjectId;
          const found = res.data.find((p) => p.id === targetId);
          if (found) {
            setSelectedProjectId(found.id);
          } else if (!targetId) {
            setSelectedProjectId(res.data[0].id);
          }
        }
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
      await fetchProjects(createdProj?.id);
      if (createdProj?.id) {
        setSelectedProjectId(createdProj.id);
        setMobileViewMode('WORKSPACE');
      }
    } catch (err: any) {
      showToast('创建项目失败: ' + err.message, 'error');
    }
  };

  const handleDeleteProject = async (id: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!window.confirm('确定要删除该制作项目吗？已锁定的库存将被自动释放。')) {
      return;
    }
    try {
      await projectApi.delete(id);
      showToast('已删除项目', 'success');
      fetchProjects();
    } catch (err: any) {
      showToast('删除失败: ' + err.message, 'error');
    }
  };

  // 过滤后的项目列表
  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      // 状态过滤
      if (statusFilter === 'COMPLETED' && p.status !== 'COMPLETED') return false;
      if (statusFilter === 'READY' && (p.readinessPercent || 0) < 100) return false;
      if (statusFilter === 'PREPARING' && (p.status === 'COMPLETED' || (p.readinessPercent || 0) >= 100)) return false;

      // 文本搜索
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = p.name.toLowerCase().includes(q);
        const matchDesc = p.description?.toLowerCase().includes(q);
        if (!matchName && !matchDesc) return false;
      }
      return true;
    });
  }, [projects, statusFilter, searchQuery]);

  // 宏观统计指标
  const metrics = useMemo(() => {
    let totalLockedPieces = 0;
    let readyCount = 0;
    let preparingCount = 0;
    let completedCount = 0;

    for (const p of projects) {
      totalLockedPieces += (p.totalPiecesLocked || p.lockedCount || 0);
      if (p.status === 'COMPLETED') completedCount++;
      else if ((p.readinessPercent || 0) >= 100) readyCount++;
      else preparingCount++;
    }

    return {
      total: projects.length,
      totalLockedPieces,
      readyCount,
      preparingCount,
      completedCount,
    };
  }, [projects]);

  return (
    <div className="max-w-[1720px] mx-auto px-2 sm:px-4 py-3 h-[calc(100vh-4.5rem)] flex flex-col min-h-0">
      {/* 现代工坊 Master-Detail 分栏工作台容器 */}
      <div className="flex-1 flex gap-3 min-h-0 overflow-hidden">
        {/* 左侧边栏 (Master Panel)：制作项目导航器 */}
        <aside
          className={`w-full md:w-84 lg:w-90 xl:w-96 flex flex-col min-h-0 bg-surface border border-border-subtle rounded-md overflow-hidden shrink-0 transition-all ${
            mobileViewMode === 'WORKSPACE' ? 'hidden md:flex' : 'flex'
          }`}
        >
          {/* 左侧顶部：标题、计数器、新建按键 */}
          <div className="p-3.5 border-b border-border-subtle bg-canvas/40 space-y-3 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Hammer className="w-5 h-5 text-accent" />
                <h1 className="font-bold text-base text-text-main tracking-tight">制作项目与套料</h1>
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-[2px] bg-subtle text-text-muted border border-border-subtle">
                  {projects.length}
                </span>
              </div>

              <button
                onClick={() => setCreateModalOpen(true)}
                className="px-2.5 py-1.5 text-xs sm:text-sm font-bold bg-accent text-white hover:bg-accent-hover rounded-[2px] shadow-2xs transition-colors flex items-center gap-1"
                title="新建硬件制作项目"
              >
                <Plus className="w-4 h-4" />
                <span>新建</span>
              </button>
            </div>

            {/* 紧凑搜索栏 */}
            <div className="relative">
              <Search className="w-4 h-4 text-text-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="过滤项目名称或说明..."
                className="w-full pl-8 pr-7 py-1.5 text-xs sm:text-sm font-mono bg-canvas border border-border-subtle rounded-[2px] text-text-main placeholder:text-text-muted/60 focus:outline-none focus:border-accent"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main text-xs font-bold"
                >
                  ✕
                </button>
              )}
            </div>

            {/* 状态过滤胶囊 */}
            <div className="grid grid-cols-4 gap-1.5 text-xs font-mono">
              <button
                onClick={() => setStatusFilter('ALL')}
                className={`py-1.5 text-center rounded-[2px] transition-colors ${
                  statusFilter === 'ALL'
                    ? 'bg-accent/10 text-accent font-bold border border-accent/30'
                    : 'bg-canvas text-text-muted hover:text-text-main border border-border-subtle'
                }`}
              >
                全部({projects.length})
              </button>
              <button
                onClick={() => setStatusFilter('PREPARING')}
                className={`py-1.5 text-center rounded-[2px] transition-colors ${
                  statusFilter === 'PREPARING'
                    ? 'bg-accent/10 text-accent font-bold border border-accent/30'
                    : 'bg-canvas text-text-muted hover:text-text-main border border-border-subtle'
                }`}
                title="备料中"
              >
                备料中
              </button>
              <button
                onClick={() => setStatusFilter('READY')}
                className={`py-1.5 text-center rounded-[2px] transition-colors ${
                  statusFilter === 'READY'
                    ? 'bg-accent/10 text-accent font-bold border border-accent/30'
                    : 'bg-canvas text-text-muted hover:text-text-main border border-border-subtle'
                }`}
                title="齐套待焊"
              >
                齐套待焊
              </button>
              <button
                onClick={() => setStatusFilter('COMPLETED')}
                className={`py-1.5 text-center rounded-[2px] transition-colors ${
                  statusFilter === 'COMPLETED'
                    ? 'bg-accent/10 text-accent font-bold border border-accent/30'
                    : 'bg-canvas text-text-muted hover:text-text-main border border-border-subtle'
                }`}
                title="已完工消库"
              >
                已完工
              </button>
            </div>
          </div>

          {/* 左侧主体：项目列表 (连续工规列表，无卡片碎片感，无生硬竖色条) */}
          <div className="flex-1 overflow-y-auto divide-y divide-border-subtle">
            {loading && projects.length === 0 ? (
              <div className="py-12 text-center text-xs text-text-muted flex flex-col items-center gap-2">
                <Hammer className="w-6 h-6 text-accent animate-pulse stroke-[2.2]" />
                <span className="font-bold">加载制作项目中...</span>
              </div>
            ) : filteredProjects.length === 0 ? (
              <div className="py-8 text-center text-xs text-text-muted font-bold">未找到匹配制作项目</div>
            ) : (
              filteredProjects.map((p) => {
                const isSelected = selectedProjectId === p.id;
                const readiness = p.readinessPercent || 0;
                const isCompleted = p.status === 'COMPLETED';

                return (
                  <div
                    key={p.id}
                    onClick={() => {
                      setSelectedProjectId(p.id);
                      setMobileViewMode('WORKSPACE');
                    }}
                    className={cn(
                      'px-3.5 py-3 transition-colors cursor-pointer select-none group',
                      isSelected
                        ? 'bg-accent/[0.08]'
                        : 'bg-surface hover:bg-subtle/70'
                    )}
                  >
                    {/* 第一行：状态指示微灯 + 项目名称 + 打样套数 */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {/* 工规状态指示灯 (取代俗气的大竖色条) */}
                        <span
                          className={cn(
                            'w-2 h-2 rounded-full shrink-0 ring-2',
                            isCompleted
                              ? 'bg-emerald-600 ring-emerald-600/20'
                              : readiness >= 100
                              ? 'bg-emerald-500 ring-emerald-500/20'
                              : 'bg-amber-500 ring-amber-500/20'
                          )}
                          title={isCompleted ? '已完工消库' : readiness >= 100 ? '齐套待焊' : '备料中'}
                        />

                        <h3
                          className={cn(
                            'text-sm font-black truncate leading-snug',
                            isSelected ? 'text-accent' : 'text-text-main'
                          )}
                          title={p.name}
                        >
                          {p.name}
                        </h3>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="font-mono text-xs font-black text-text-main px-1.5 py-0.5 bg-canvas border border-border-subtle rounded-[2px]">
                          x{p.target_qty || 1}套
                        </span>

                        {/* 悬浮才显示的快捷删除 */}
                        <button
                          onClick={(e) => handleDeleteProject(p.id, e)}
                          className="p-1 text-text-muted hover:text-danger rounded opacity-0 group-hover:opacity-100 transition-opacity"
                          title="删除项目"
                        >
                          <Trash2 className="w-3.5 h-3.5 stroke-[2.2]" />
                        </button>
                      </div>
                    </div>

                    {/* 第二行：说明文字 (若有) */}
                    {p.description && (
                      <p className="text-xs text-text-muted font-medium mt-1 truncate pl-4">
                        {p.description}
                      </p>
                    )}

                    {/* 第三行：工规紧凑指标 (等宽字体，齐套率 + 已锁件数) */}
                    <div className="mt-1.5 pl-4 flex items-center justify-between text-xs font-mono font-bold text-text-muted">
                      <div className="flex items-center gap-2">
                        <span>
                          齐套 <strong className={cn('font-black', readiness >= 100 ? 'text-emerald-600' : 'text-accent')}>{readiness}%</strong>
                          <span className="text-[11px] font-normal text-text-muted ml-0.5">({p.ready_items_count || 0}/{p.total_items_count || 0}项)</span>
                        </span>
                        <span>·</span>
                        <span className="text-amber-700 dark:text-amber-400 font-bold flex items-center gap-0.5">
                          <Lock className="w-3 h-3 stroke-[2.2]" />
                          <span>已锁 {p.totalPiecesLocked || p.lockedCount || 0}件</span>
                        </span>
                      </div>

                      <ChevronRight className={cn(
                        'w-3.5 h-3.5 transition-transform stroke-[2.5]',
                        isSelected ? 'text-accent translate-x-0.5' : 'text-text-muted/60 opacity-0 group-hover:opacity-100'
                      )} />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* 左侧底部：工坊微看板 */}
          <div className="p-3 border-t border-border-subtle bg-canvas/40 shrink-0 font-mono text-xs text-text-muted">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <span className="block text-text-muted text-[11px] mb-0.5">项目总数</span>
                <strong className="text-sm font-black text-text-main">{metrics.total}</strong>
              </div>
              <div>
                <span className="block text-text-muted text-[11px] mb-0.5">齐套待焊</span>
                <strong className="text-sm font-black text-emerald-600">{metrics.readyCount}</strong>
              </div>
              <div>
                <span className="block text-text-muted text-[11px] mb-0.5">预锁现货</span>
                <strong className="text-sm font-black text-amber-600">{metrics.totalLockedPieces}件</strong>
              </div>
            </div>
          </div>
        </aside>

        {/* 右侧主舞台 (Detail Workspace)：常驻套料锁库与拣料工作台 */}
        <main
          className={`flex-1 flex flex-col min-h-0 ${
            mobileViewMode === 'LIST' ? 'hidden md:flex' : 'flex'
          }`}
        >
          <ProjectWorkspace
            projectId={selectedProjectId}
            onProjectUpdated={() => fetchProjects(selectedProjectId || undefined)}
            onDeleteProject={(id) => handleDeleteProject(id)}
            onBackToList={() => setMobileViewMode('LIST')}
          />
        </main>
      </div>

      {/* 新建项目模态框 */}
      <Modal isOpen={createModalOpen} onClose={() => setCreateModalOpen(false)} title="新建制作项目" maxWidth="max-w-md">
        <div className="space-y-4 text-xs sm:text-sm">
          <div>
            <label className="block text-text-muted mb-1 font-semibold">项目名称 *</label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="例如: ESP32-S3 智能墨水屏时钟 v1.0"
              className="w-full bg-canvas border border-border-subtle rounded-[2px] px-3 py-2 text-xs sm:text-sm text-text-main focus:outline-none focus:border-accent"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-text-muted mb-1 font-semibold">制作目标套数 (板)</label>
            <input
              type="number"
              min={1}
              value={targetQty}
              onChange={(e) => setTargetQty(parseInt(e.target.value, 10) || 1)}
              placeholder="打样/制作套数 (默认 1)"
              className="w-full bg-canvas border border-border-subtle rounded-[2px] px-3 py-2 text-xs sm:text-sm font-mono font-bold text-text-main focus:outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="block text-text-muted mb-1 font-semibold">项目说明 / 目标</label>
            <textarea
              rows={3}
              value={projectDesc}
              onChange={(e) => setProjectDesc(e.target.value)}
              placeholder="记录 PCB 版本、打板批次或关键技术参数..."
              className="w-full bg-canvas border border-border-subtle rounded-[2px] p-3 text-xs sm:text-sm text-text-main focus:outline-none focus:border-accent resize-none"
            />
          </div>

          <button
            type="button"
            onClick={handleCreate}
            className="w-full py-2.5 bg-accent hover:bg-accent-hover text-white font-bold text-xs sm:text-sm rounded-[2px] shadow-xs transition-colors"
          >
            确认创建并进入工作台
          </button>
        </div>
      </Modal>
    </div>
  );
};
