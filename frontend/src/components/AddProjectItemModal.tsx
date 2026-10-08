import React, { useState } from 'react';
import { ComponentItem } from '../types/component';
import { componentApi } from '../api/componentApi';
import { bomApi } from '../api/bomApi';
import { projectApi } from '../api/projectApi';
import { useToastStore } from '../store/useToastStore';
import { Plus, Search, X, Check, ClipboardPaste, Box, Cpu } from 'lucide-react';
import { cn } from '../lib/utils';

interface AddProjectItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: number;
  projectTargetQty?: number;
  onSuccess: () => void;
}

export const AddProjectItemModal: React.FC<AddProjectItemModalProps> = ({
  isOpen,
  onClose,
  projectId,
  projectTargetQty = 1,
  onSuccess,
}) => {
  const { showToast } = useToastStore();
  const [tab, setTab] = useState<'search' | 'manual' | 'paste'>('search');

  // 搜索已有物料状态
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<ComponentItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedComp, setSelectedComp] = useState<ComponentItem | null>(null);

  // 表单状态
  const [partName, setPartName] = useState('');
  const [pkg, setPkg] = useState('');
  const [unitQty, setUnitQty] = useState<number>(1);
  const [designators, setDesignators] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 批量粘贴状态
  const [pasteText, setPasteText] = useState('');

  if (!isOpen) return null;

  const handleSearch = async (q: string) => {
    setQuery(q);
    if (!q.trim()) {
      setCandidates([]);
      return;
    }
    setSearching(true);
    try {
      const res = await componentApi.getAll({ q: q.trim() });
      if (res.success && res.data) {
        setCandidates(res.data);
      }
    } catch {
      setCandidates([]);
    } finally {
      setSearching(false);
    }
  };

  const handleSelectComp = (comp: ComponentItem) => {
    setSelectedComp(comp);
    setPartName(comp.name);
    setPkg(comp.package || '');
  };

  // 单项提交
  const handleSubmitSingle = async () => {
    if (!partName.trim()) {
      showToast('请输入物料规格/型号', 'warn');
      return;
    }
    if (unitQty <= 0) {
      showToast('单板需求用量必须大于 0', 'warn');
      return;
    }

    setSubmitting(true);
    try {
      await projectApi.addItem(projectId, {
        part_name: partName.trim(),
        package: pkg.trim(),
        unit_demand_qty: unitQty,
        total_demand_qty: unitQty * Math.max(1, projectTargetQty),
        component_id: selectedComp ? selectedComp.id : null,
        designators: designators.trim(),
      });
      showToast(`✔ 成功添加物料「${partName}」至项目套料`, 'success');
      onSuccess();
      onClose();
    } catch (err: any) {
      showToast('添加失败: ' + err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // 批量粘贴提交
  const handleBatchPasteSubmit = async () => {
    if (!pasteText.trim()) {
      showToast('请先粘贴 BOM 文本', 'warn');
      return;
    }
    setSubmitting(true);
    try {
      const parseRes = await bomApi.parseBomText(pasteText);
      if (!parseRes.success || !parseRes.data) {
        throw new Error('未能识别有效的数据行');
      }

      const { dataRows, autoMapping } = parseRes.data;
      let addedCount = 0;

      for (const row of dataRows) {
        const name = String(row[autoMapping.partCol] || '').trim();
        if (!name) continue;
        const foot = autoMapping.footprintCol >= 0 ? String(row[autoMapping.footprintCol] || '').trim() : '';
        const des = autoMapping.designatorCol >= 0 ? String(row[autoMapping.designatorCol] || '').trim() : '';
        let qty = autoMapping.quantityCol >= 0 ? parseInt(row[autoMapping.quantityCol], 10) : 1;
        if (isNaN(qty) || qty <= 0) qty = 1;

        await projectApi.addItem(projectId, {
          part_name: name,
          package: foot,
          unit_demand_qty: qty,
          total_demand_qty: qty * Math.max(1, projectTargetQty),
          designators: des,
        });
        addedCount++;
      }

      showToast(`✔ 成功批量导入 ${addedCount} 种物料至项目！`, 'success');
      onSuccess();
      onClose();
    } catch (err: any) {
      showToast('批量导入失败: ' + err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-surface border border-border-subtle rounded-2xl w-full max-w-xl shadow-xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* 顶部标题栏 */}
        <div className="px-5 py-4 border-b border-border-subtle flex items-center justify-between bg-canvas/40">
          <div>
            <h3 className="text-sm font-bold text-text-main flex items-center gap-2">
              <Plus className="w-4 h-4 text-accent" />
              <span>添加项目元器件物料</span>
            </h3>
            <p className="text-xs text-text-muted mt-0.5">
              为该项目指定单板用量与位号，系统将自动核算总需求与锁库状态
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-main hover:bg-surface-hover transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 模式切换 Tab */}
        <div className="p-3 bg-surface border-b border-border-subtle flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTab('search')}
            className={cn(
              'px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all',
              tab === 'search' ? 'bg-accent text-white shadow-sm' : 'text-text-muted hover:bg-subtle'
            )}
          >
            <Search className="w-3.5 h-3.5" />
            <span>从库存搜索挑选</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('manual');
              setSelectedComp(null);
            }}
            className={cn(
              'px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all',
              tab === 'manual' ? 'bg-accent text-white shadow-sm' : 'text-text-muted hover:bg-subtle'
            )}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>手动录入缺料/新器件</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('paste')}
            className={cn(
              'px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all',
              tab === 'paste' ? 'bg-accent text-white shadow-sm' : 'text-text-muted hover:bg-subtle'
            )}
          >
            <ClipboardPaste className="w-3.5 h-3.5" />
            <span>批量粘贴 BOM 表格</span>
          </button>
        </div>

        {/* 表单内容区 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {tab === 'search' && (
            <div className="space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 text-text-dim absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => handleSearch(e.target.value)}
                  placeholder="搜索库存中的元器件名称、阻容值、封装或立创号..."
                  className="w-full bg-canvas border border-border-subtle rounded-xl pl-9 pr-3 py-2 text-xs text-text-main focus:outline-none focus:border-accent"
                  autoFocus
                />
              </div>

              {/* 搜索候选列表 */}
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {searching && <div className="py-6 text-center text-xs text-text-dim">检索中...</div>}
                {!searching && candidates.length === 0 && query && (
                  <div className="py-6 text-center text-xs text-text-dim">
                    未找到在库物料，可切换至「手动录入缺料/新器件」添加
                  </div>
                )}
                {!searching &&
                  candidates.map((comp) => {
                    const isSelected = selectedComp?.id === comp.id;
                    return (
                      <div
                        key={comp.id}
                        onClick={() => handleSelectComp(comp)}
                        className={cn(
                          'p-2.5 rounded-xl border text-xs cursor-pointer flex items-center justify-between transition-all',
                          isSelected
                            ? 'bg-accent/10 border-accent text-accent'
                            : 'bg-canvas hover:bg-surface-hover border-border-subtle'
                        )}
                      >
                        <div>
                          <div className="font-semibold text-text-main">{comp.name}</div>
                          <div className="text-[11px] text-text-dim mt-0.5">
                            {comp.package || '-'} · 📦 {comp.location || '未标注'} · 余量: {comp.quantity}
                          </div>
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-accent" />}
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* 单项表单输入（search 和 manual 共用） */}
          {tab !== 'paste' && (
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border-subtle text-xs">
              <div className="col-span-2">
                <label className="block text-text-muted font-medium mb-1">器件型号 / 规格 *</label>
                <input
                  type="text"
                  value={partName}
                  onChange={(e) => setPartName(e.target.value)}
                  placeholder="如: 100nF 50V 或 STM32F103C8T6"
                  className="w-full bg-canvas border border-border-subtle rounded-xl px-3 py-2 text-xs text-text-main focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-text-muted font-medium mb-1">封装 (选填)</label>
                <input
                  type="text"
                  value={pkg}
                  onChange={(e) => setPkg(e.target.value)}
                  placeholder="如: 0603, SOP-8"
                  className="w-full bg-canvas border border-border-subtle rounded-xl px-3 py-2 text-xs text-text-main focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-text-muted font-medium mb-1">单板用量 (件) *</label>
                <input
                  type="number"
                  min={1}
                  value={unitQty}
                  onChange={(e) => setUnitQty(parseInt(e.target.value, 10) || 1)}
                  className="w-full bg-canvas border border-border-subtle rounded-xl px-3 py-2 text-xs font-mono font-bold text-text-main focus:outline-none focus:border-accent"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-text-muted font-medium mb-1">原理图位号 (选填)</label>
                <input
                  type="text"
                  value={designators}
                  onChange={(e) => setDesignators(e.target.value)}
                  placeholder="如: C1, C2, C3"
                  className="w-full bg-canvas border border-border-subtle rounded-xl px-3 py-2 text-xs font-mono text-text-main focus:outline-none focus:border-accent"
                />
              </div>
            </div>
          )}

          {/* 模式 3: 批量粘贴 */}
          {tab === 'paste' && (
            <div className="space-y-3">
              <textarea
                rows={8}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={`直接粘贴立创EDA或Excel中的BOM表格文本...\n\n器件\t位号\t封装\t数量\n10k 1%\tR1, R2\t0805\t2\n100nF\tC1, C2\t0603\t2`}
                className="w-full font-mono text-xs p-3.5 rounded-xl border border-border-subtle bg-canvas/40 text-text-main focus:outline-none focus:border-accent"
              />
              <div className="text-[11px] text-text-dim">
                系统将自动提取各行型号、封装、数量与位号，批量添加到当前项目中。
              </div>
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="p-4 border-t border-border-subtle bg-canvas/40 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-subtle hover:bg-surface-hover rounded-xl text-xs font-medium text-text-main transition-colors"
          >
            取消
          </button>
          {tab === 'paste' ? (
            <button
              type="button"
              disabled={submitting || !pasteText.trim()}
              onClick={handleBatchPasteSubmit}
              className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors flex items-center gap-1.5"
            >
              <ClipboardPaste className="w-3.5 h-3.5" />
              <span>{submitting ? '导入中...' : '一键批量导入'}</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={submitting || !partName.trim()}
              onClick={handleSubmitSingle}
              className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{submitting ? '添加中...' : '确认添加到项目'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
