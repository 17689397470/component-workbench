import React, { useState, useEffect } from 'react';
import { ComponentItem } from '../types/component';
import { componentApi } from '../api/componentApi';
import { Search, X, Check, Box, Cpu } from 'lucide-react';

interface ManualSubstituteModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetPartName: string;
  targetFootprint?: string;
  qtyNeeded: number;
  onSelect: (comp: ComponentItem, remember: boolean, note: string) => void;
}

export const ManualSubstituteModal: React.FC<ManualSubstituteModalProps> = ({
  isOpen,
  onClose,
  targetPartName,
  targetFootprint,
  qtyNeeded,
  onSelect,
}) => {
  const [query, setQuery] = useState(targetPartName || '');
  const [candidates, setCandidates] = useState<ComponentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedComp, setSelectedComp] = useState<ComponentItem | null>(null);
  const [rememberRule, setRememberRule] = useState(true);
  const [ruleNote, setRuleNote] = useState('');

  useEffect(() => {
    if (isOpen) {
      setQuery(targetPartName || '');
      setSelectedComp(null);
      setRememberRule(true);
      setRuleNote(`替换需求: ${targetPartName} (${targetFootprint || '通用'})`);
      searchItems(targetPartName || '');
    }
  }, [isOpen, targetPartName]);

  const searchItems = async (q: string) => {
    setLoading(true);
    try {
      const res = await componentApi.getAll({ q: q.trim() });
      if (res.success && res.data) {
        setCandidates(res.data);
      }
    } catch {
      setCandidates([]);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-surface border border-border-subtle rounded-2xl w-full max-w-2xl shadow-xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* 顶部标题栏 */}
        <div className="px-5 py-4 border-b border-border-subtle flex items-center justify-between bg-canvas/40">
          <div>
            <h3 className="text-sm font-bold text-text-main flex items-center gap-2">
              <Cpu className="w-4 h-4 text-accent" />
              <span>选择库存替代料</span>
            </h3>
            <p className="text-xs text-text-muted mt-0.5">
              为 <strong className="text-text-main font-mono">{targetPartName}</strong>{' '}
              {targetFootprint && <span className="font-mono">[{targetFootprint}]</span>} 手动绑定在库替代料 (需 {qtyNeeded} 件)
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

        {/* 搜索过滤框 */}
        <div className="p-4 border-b border-border-subtle bg-surface">
          <div className="relative">
            <Search className="w-4 h-4 text-text-dim absolute left-3 top-2.5" />
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                searchItems(e.target.value);
              }}
              placeholder="搜索库存中的型号、阻容值、封装或立创号..."
              className="w-full bg-canvas border border-border-subtle rounded-xl pl-9 pr-4 py-2 text-xs text-text-main focus:outline-none focus:border-accent"
              autoFocus
            />
          </div>
        </div>

        {/* 候选列表区 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-[220px]">
          {loading && (
            <div className="py-12 text-center text-xs text-text-dim">正在检索库存物料...</div>
          )}

          {!loading && candidates.length === 0 && (
            <div className="py-12 text-center text-xs text-text-dim">
              未找到与 "{query}" 匹配的库存物料，请尝试放宽搜索词
            </div>
          )}

          {!loading &&
            candidates.map((comp) => {
              const isSelected = selectedComp?.id === comp.id;
              const isSufficient = comp.quantity >= qtyNeeded;

              return (
                <div
                  key={comp.id}
                  onClick={() => setSelectedComp(comp)}
                  className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between gap-3 ${
                    isSelected
                      ? 'bg-accent/10 border-accent shadow-sm'
                      : 'bg-canvas hover:bg-surface-hover border-border-subtle'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-text-main truncate">
                        {comp.name}
                      </span>
                      {comp.package && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-subtle text-text-muted">
                          {comp.package}
                        </span>
                      )}
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-subtle text-text-muted">
                        {comp.category}
                      </span>
                    </div>

                    <div className="text-[11px] text-text-dim mt-1 flex items-center gap-3">
                      <span>📦 货位: <strong className="text-text-main font-mono">{comp.location || '未标注'}</strong></span>
                      {comp.lcsc_part && <span>立创号: <strong className="text-text-main font-mono">{comp.lcsc_part}</strong></span>}
                      {comp.value && <span>参数: {comp.value}</span>}
                    </div>
                  </div>

                  <div className="text-right flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-xs font-mono font-bold">
                        余量: <span className={isSufficient ? 'text-emerald-600' : 'text-amber-600'}>{comp.quantity}</span>
                      </div>
                      <div className="text-[10px] text-text-dim">
                        {isSufficient ? '现货充足' : `缺 ${qtyNeeded - comp.quantity}`}
                      </div>
                    </div>

                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center border ${
                        isSelected
                          ? 'bg-accent border-accent text-white'
                          : 'border-border-subtle bg-surface text-transparent'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </div>
              );
            })}
        </div>

        {/* 底部记忆规则与确认操作 */}
        <div className="p-4 border-t border-border-subtle bg-canvas/40 space-y-3">
          <div className="flex items-start gap-2.5">
            <input
              type="checkbox"
              id="rememberRuleCheck"
              checked={rememberRule}
              onChange={(e) => setRememberRule(e.target.checked)}
              className="mt-0.5 rounded border-border-subtle text-accent focus:ring-accent"
            />
            <div className="flex-1 text-xs">
              <label htmlFor="rememberRuleCheck" className="font-semibold text-text-main cursor-pointer">
                记住此替代偏好规则 (长期沉淀)
              </label>
              <p className="text-[11px] text-text-muted mt-0.5">
                今后比对遇到相同的 "{targetPartName}" 时，系统将自动优先推荐选中的替代料。
              </p>
              {rememberRule && (
                <input
                  type="text"
                  value={ruleNote}
                  onChange={(e) => setRuleNote(e.target.value)}
                  placeholder="规则备注 (如: 手工焊接飞线兼容、耐压充裕等)..."
                  className="mt-1.5 w-full bg-surface border border-border-subtle rounded-lg px-2.5 py-1 text-xs text-text-main focus:outline-none focus:border-accent"
                />
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 bg-subtle hover:bg-surface-hover rounded-xl text-xs font-medium text-text-main transition-colors"
            >
              取消
            </button>
            <button
              type="button"
              disabled={!selectedComp}
              onClick={() => {
                if (selectedComp) {
                  onSelect(selectedComp, rememberRule, ruleNote);
                  onClose();
                }
              }}
              className="px-4 py-1.5 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <Check className="w-3.5 h-3.5" />
              <span>采纳并绑定替代料</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
