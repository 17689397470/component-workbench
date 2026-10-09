import React, { useState, useEffect } from 'react';
import { Drawer } from '../ui/Drawer';
import { projectApi } from '../../api/projectApi';
import { componentApi } from '../../api/componentApi';
import { useToastStore } from '../../store/useToastStore';
import { ComponentItem } from '../../types/component';
import { ProjectItemDetail } from '../../types/project';
import {
  Layers,
  Hash,
  Box,
  MapPin,
  Search,
  CheckCircle2,
  AlertTriangle,
  Unlink,
  Sparkles,
  Save,
  Cpu,
  RefreshCw,
  Link2
} from 'lucide-react';

interface ProjectMaterialDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: number;
  targetQty?: number;
  item: ProjectItemDetail | null;
  onSaved: () => void;
}

export const ProjectMaterialDrawer: React.FC<ProjectMaterialDrawerProps> = ({
  isOpen,
  onClose,
  projectId,
  targetQty = 1,
  item,
  onSaved,
}) => {
  const { showToast } = useToastStore();

  // 基础表单状态
  const [partName, setPartName] = useState('');
  const [pkg, setPkg] = useState('');
  const [unitQty, setUnitQty] = useState(1);
  const [designators, setDesignators] = useState('');

  // 选中的关联库存 ID (null 表示解绑)
  const [selectedCompId, setSelectedCompId] = useState<number | null>(null);
  const [selectedCompInfo, setSelectedCompInfo] = useState<ComponentItem | null>(null);

  // 搜索现有库存状态
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<ComponentItem[]>([]);

  // 智能替代料推荐状态
  const [loadingAlternatives, setLoadingAlternatives] = useState(false);
  const [alternatives, setAlternatives] = useState<any[]>([]);

  // 提交保存状态
  const [saving, setSaving] = useState(false);

  // 初始化与重置表单
  useEffect(() => {
    if (isOpen && item) {
      setPartName(item.part_name || '');
      setPkg(item.package || '');
      setUnitQty(item.unit_demand_qty || 1);
      setDesignators(item.designators || '');
      setSelectedCompId(item.component_id || null);

      if (item.component_id) {
        setSelectedCompInfo({
          id: item.component_id,
          name: item.comp_name || item.part_name,
          package: item.comp_package || item.package,
          category: item.comp_category || '',
          quantity: item.comp_total_stock || 0,
          location: item.comp_location || '',
          lcsc_part: item.comp_lcsc || '',
        } as ComponentItem);
      } else {
        setSelectedCompInfo(null);
      }

      setSearchQuery('');
      setSearchResults([]);
      fetchAlternatives(item.id);
    }
  }, [isOpen, item]);

  // 拉取智能替代料推荐
  const fetchAlternatives = async (itemId: number) => {
    if (!projectId || !itemId) return;
    setLoadingAlternatives(true);
    try {
      const res = await projectApi.getAlternatives(projectId, itemId);
      if (res.success && res.data) {
        setAlternatives(res.data.candidates || []);
      }
    } catch (e) {
      console.warn('获取替代料建议失败:', e);
      setAlternatives([]);
    } finally {
      setLoadingAlternatives(false);
    }
  };

  // 实时搜索库房元器件
  const handleSearchComponents = async (q: string) => {
    setSearchQuery(q);
    if (!q.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await componentApi.getAll({ q: q.trim() });
      if (res.success && res.data) {
        setSearchResults(res.data.slice(0, 10));
      }
    } catch (e) {
      console.error('搜索库存失败:', e);
    } finally {
      setSearching(false);
    }
  };

  // 选定某个库存器件绑定
  const handleSelectComponent = (comp: ComponentItem) => {
    setSelectedCompId(comp.id);
    setSelectedCompInfo(comp);
    // 若封装为空，则自动同步库存的封装
    if (!pkg && comp.package) {
      setPkg(comp.package);
    }
    showToast(`✔ 已选定绑定库存器件「${comp.name}」`, 'info');
  };

  // 解除绑定当前库存
  const handleUnbindComponent = () => {
    setSelectedCompId(null);
    setSelectedCompInfo(null);
    showToast('已取消库存关联（保存后将作为缺料物料）', 'warn');
  };

  // 提交更新
  const handleSave = async () => {
    if (!item) return;
    if (!partName.trim()) {
      showToast('器件型号/规格不能为空', 'warn');
      return;
    }

    setSaving(true);
    try {
      const res = await projectApi.updateItem(projectId, item.id, {
        part_name: partName.trim(),
        package: pkg.trim(),
        unit_demand_qty: Math.max(1, unitQty),
        designators: designators.trim(),
        component_id: selectedCompId,
      });

      if (res.success) {
        showToast('✔ 物料更新成功，已自动重新核算锁库！', 'success');
        onSaved();
        onClose();
      } else {
        showToast('保存失败', 'error');
      }
    } catch (err: any) {
      showToast('保存失败: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!item) return null;

  const totalDemand = Math.max(1, unitQty) * Math.max(1, targetQty);

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <Cpu className="w-5 h-5 text-accent" />
          <span>物料规格与配料纠偏</span>
        </div>
      }
      subtitle={
        <span className="font-mono text-xs">
          工程套数: {targetQty} 套 · 需求总数: {totalDemand} 件
        </span>
      }
      maxWidth="max-w-xl"
      footer={
        <div className="flex items-center justify-between w-full">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-text-muted hover:text-text-main transition-colors"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 bg-accent hover:bg-accent-hover text-white text-xs font-bold rounded-[2px] shadow-sm flex items-center gap-1.5 transition-colors"
          >
            {saving ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            <span>保存并自动锁库</span>
          </button>
        </div>
      }
    >
      <div className="space-y-6 text-text-main pb-4">
        {/* 1. 基础物理规格与电路位号 */}
        <section className="bg-canvas border border-border-subtle rounded-[3px] p-4 space-y-3.5">
          <div className="text-xs font-bold uppercase tracking-wider text-text-muted flex items-center gap-1.5 font-mono">
            <Layers className="w-3.5 h-3.5 text-accent" />
            <span>1. 基础规格与 BOM 属性</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* 型号 */}
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold text-text-muted mb-1">
                物料型号 / 器件规格 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={partName}
                onChange={(e) => setPartName(e.target.value)}
                placeholder="例如 10k 1% 或 STM32F401CCU6"
                className="w-full px-3 py-1.5 text-xs font-mono font-bold bg-surface border border-border-subtle rounded-[2px] focus:outline-none focus:border-accent"
              />
            </div>

            {/* 封装 */}
            <div>
              <label className="block text-[11px] font-bold text-text-muted mb-1">
                封装形式 (Package)
              </label>
              <input
                type="text"
                value={pkg}
                onChange={(e) => setPkg(e.target.value)}
                placeholder="例如 0603, SOP-8"
                className="w-full px-3 py-1.5 text-xs font-mono bg-surface border border-border-subtle rounded-[2px] focus:outline-none focus:border-accent"
              />
            </div>

            {/* 单板需求数量 */}
            <div>
              <label className="block text-[11px] font-bold text-text-muted mb-1">
                单板用量 (总需: {totalDemand} 件)
              </label>
              <input
                type="number"
                min="1"
                value={unitQty}
                onChange={(e) => setUnitQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-full px-3 py-1.5 text-xs font-mono font-bold bg-surface border border-border-subtle rounded-[2px] focus:outline-none focus:border-accent"
              />
            </div>

            {/* 电路位号 */}
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold text-text-muted mb-1">
                电路位号 (Designators)
              </label>
              <input
                type="text"
                value={designators}
                onChange={(e) => setDesignators(e.target.value)}
                placeholder="例如 R1, R2, R3-R5"
                className="w-full px-3 py-1.5 text-xs font-mono text-accent bg-surface border border-border-subtle rounded-[2px] focus:outline-none focus:border-accent"
              />
            </div>
          </div>
        </section>

        {/* 2. 当前关联的库存器件状态 */}
        <section className="bg-canvas border border-border-subtle rounded-[3px] p-4 space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-text-muted flex items-center justify-between font-mono">
            <div className="flex items-center gap-1.5">
              <Box className="w-3.5 h-3.5 text-accent" />
              <span>2. 当前绑定的物理库存</span>
            </div>
            {selectedCompInfo && (
              <button
                type="button"
                onClick={handleUnbindComponent}
                className="text-[11px] text-danger hover:underline flex items-center gap-1 font-sans"
              >
                <Unlink className="w-3 h-3" />
                <span>解除绑定</span>
              </button>
            )}
          </div>

          {selectedCompInfo ? (
            <div className="bg-surface border border-border-subtle rounded-[2px] p-3 flex items-start justify-between gap-3 shadow-2xs">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs text-text-main">{selectedCompInfo.name}</span>
                  {selectedCompInfo.package && (
                    <span className="px-1.5 py-0.5 text-[10px] font-mono bg-canvas border border-border-subtle rounded-[2px] font-bold text-text-muted">
                      {selectedCompInfo.package}
                    </span>
                  )}
                  {selectedCompInfo.lcsc_part && (
                    <span className="text-[10px] font-mono text-blue-600 bg-blue-500/10 px-1 py-0.5 rounded">
                      {selectedCompInfo.lcsc_part}
                    </span>
                  )}
                </div>
                <div className="text-[11px] font-mono text-text-muted flex items-center gap-3">
                  <span className="flex items-center gap-1 text-accent font-bold">
                    <MapPin className="w-3 h-3" />
                    {selectedCompInfo.location || '随手存放处 (无货位)'}
                  </span>
                  <span>总在库: {selectedCompInfo.quantity} 件</span>
                </div>
              </div>

              <div className="text-right">
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  <CheckCircle2 className="w-3 h-3" />
                  已绑定
                </span>
              </div>
            </div>
          ) : (
            <div className="bg-amber-500/5 border border-dashed border-amber-500/30 rounded-[2px] p-3 flex items-center gap-2.5 text-amber-700 dark:text-amber-400 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0 stroke-[2]" />
              <div>
                <div className="font-bold">尚未关联库存器件</div>
                <div className="text-[11px] opacity-80 mt-0.5">
                  该料将作为缺料项。您可在下方搜索工坊现有库存或直接换用推荐替代料。
                </div>
              </div>
            </div>
          )}
        </section>

        {/* 3. 智能等价替代料推荐 */}
        {alternatives.length > 0 && (
          <section className="bg-blue-500/[0.04] border border-blue-500/20 rounded-[3px] p-4 space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400 flex items-center gap-1.5 font-mono">
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              <span>3. 智能推荐可用替代料 ({alternatives.length} 种)</span>
            </div>

            <div className="space-y-2">
              {alternatives.map((alt) => {
                const isCurrentChosen = selectedCompId === alt.component.id;
                return (
                  <div
                    key={alt.component.id}
                    className={`bg-surface border p-2.5 rounded-[2px] flex items-center justify-between gap-3 transition-colors ${
                      isCurrentChosen
                        ? 'border-accent bg-accent/5'
                        : 'border-border-subtle hover:border-blue-500/40'
                    }`}
                  >
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-xs text-text-main truncate">
                          {alt.component.name}
                        </span>
                        {alt.component.package && (
                          <span className="px-1 text-[10px] font-mono bg-canvas border border-border-subtle rounded text-text-muted">
                            {alt.component.package}
                          </span>
                        )}
                        <span className="text-[10px] text-blue-700 dark:text-blue-300 bg-blue-500/10 px-1.5 py-0.2 rounded font-bold">
                          {alt.reason}
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-text-muted flex items-center gap-3">
                        <span className="text-accent font-bold">
                          货位: {alt.component.location || '随手存放处'}
                        </span>
                        <span>可用量: {alt.availableQty} 件</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleSelectComponent(alt.component)}
                      disabled={isCurrentChosen}
                      className={`px-3 py-1 rounded-[2px] text-xs font-bold flex items-center gap-1 shrink-0 transition-colors ${
                        isCurrentChosen
                          ? 'bg-emerald-600 text-white cursor-default'
                          : 'bg-blue-600 hover:bg-blue-700 text-white'
                      }`}
                    >
                      {isCurrentChosen ? (
                        <>
                          <CheckCircle2 className="w-3 h-3" />
                          <span>已选用</span>
                        </>
                      ) : (
                        <>
                          <Link2 className="w-3 h-3" />
                          <span>换用此料</span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* 4. 全局库存即搜即绑面板 */}
        <section className="bg-canvas border border-border-subtle rounded-[3px] p-4 space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-text-muted flex items-center gap-1.5 font-mono">
            <Search className="w-3.5 h-3.5 text-accent" />
            <span>4. 手动检索现有库存绑定</span>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-text-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchComponents(e.target.value)}
              placeholder="输入型号、阻值、封装或 C编号快速查找..."
              className="w-full pl-8 pr-3 py-1.5 text-xs font-mono bg-surface border border-border-subtle rounded-[2px] focus:outline-none focus:border-accent"
            />
            {searching && (
              <RefreshCw className="w-3.5 h-3.5 text-text-muted animate-spin absolute right-2.5 top-1/2 -translate-y-1/2" />
            )}
          </div>

          {searchResults.length > 0 && (
            <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
              {searchResults.map((c) => {
                const isSelected = selectedCompId === c.id;
                return (
                  <div
                    key={c.id}
                    onClick={() => handleSelectComponent(c)}
                    className={`p-2 bg-surface border rounded-[2px] cursor-pointer flex items-center justify-between gap-2 text-xs transition-colors ${
                      isSelected
                        ? 'border-accent bg-accent/5'
                        : 'border-border-subtle hover:bg-surface-hover'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-text-main truncate flex items-center gap-1.5">
                        <span>{c.name}</span>
                        {c.package && (
                          <span className="text-[10px] font-mono px-1 bg-canvas border border-border-subtle rounded text-text-muted">
                            {c.package}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] font-mono text-text-muted flex items-center gap-2 mt-0.5">
                        <span className="text-accent font-bold">{c.location || '未入盒'}</span>
                        <span>现有存量: {c.quantity}</span>
                        {c.lcsc_part && <span>LCSC: {c.lcsc_part}</span>}
                      </div>
                    </div>

                    <button
                      type="button"
                      className={`px-2 py-0.5 text-[11px] font-bold rounded-[2px] shrink-0 ${
                        isSelected
                          ? 'bg-emerald-600 text-white'
                          : 'bg-canvas border border-border-subtle hover:border-accent text-text-main'
                      }`}
                    >
                      {isSelected ? '已选' : '选择'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </Drawer>
  );
};
