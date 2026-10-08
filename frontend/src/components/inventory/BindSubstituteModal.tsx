import React, { useState, useEffect } from 'react';
import { ComponentItem } from '../../types/component';
import { componentApi } from '../../api/componentApi';
import { useToastStore } from '../../store/useToastStore';
import { Search, X, Check, Link2, Box } from 'lucide-react';

interface BindSubstituteModalProps {
  isOpen: boolean;
  onClose: () => void;
  component: ComponentItem;
  onSuccess: () => void;
}

export const BindSubstituteModal: React.FC<BindSubstituteModalProps> = ({
  isOpen,
  onClose,
  component,
  onSuccess,
}) => {
  const { showToast } = useToastStore();
  const [keyword, setKeyword] = useState('');
  const [candidates, setCandidates] = useState<ComponentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setKeyword('');
    setSelectedId(null);
    setNote('');

    // 默认预加载同分类的元器件
    setLoading(true);
    componentApi
      .getAll({ category: component.category })
      .then((res) => {
        if (res.success && res.data) {
          setCandidates(res.data.filter((c) => c.id !== component.id));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isOpen, component]);

  const handleSearch = async (kw: string) => {
    setKeyword(kw);
    setLoading(true);
    try {
      const res = await componentApi.getAll({ q: kw });
      if (res.success && res.data) {
        setCandidates(res.data.filter((c) => c.id !== component.id));
      }
    } catch (err: any) {
      showToast('搜索失败: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleBind = async () => {
    if (!selectedId) return;
    setSubmitting(true);
    try {
      const res = await componentApi.bindSubstitute(component.id, selectedId, note.trim());
      if (res.success) {
        showToast('已成功绑定平替物料', 'success');
        onSuccess();
        onClose();
      }
    } catch (err: any) {
      showToast('绑定失败: ' + err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-surface border border-border-subtle rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border-subtle flex items-center justify-between bg-surface-subtle">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent">
              <Link2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-text-main text-xs">绑定工坊平替物料</h3>
              <p className="text-[11px] text-text-dim">
                为 <span className="font-semibold text-text-main">{component.name}</span> 指定常备替代料
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-dim hover:text-text-main hover:bg-subtle transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-border-subtle">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
            <input
              type="text"
              value={keyword}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="搜索工坊库存物料（型号/阻容/封装/C编号）..."
              className="w-full bg-surface-subtle border border-border-subtle rounded-xl pl-9 pr-3 py-2 text-xs text-text-main focus:outline-none focus:border-accent"
              autoFocus
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading ? (
            <div className="py-12 text-center text-text-dim text-xs">搜索备选中...</div>
          ) : candidates.length === 0 ? (
            <div className="py-12 text-center text-text-dim text-xs">未找到符合条件的库存物料</div>
          ) : (
            candidates.map((cand) => {
              const isSelected = selectedId === cand.id;
              return (
                <div
                  key={cand.id}
                  onClick={() => setSelectedId(cand.id)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                    isSelected
                      ? 'bg-accent/10 border-accent/40 shadow-sm'
                      : 'bg-surface border-border-subtle hover:border-border-strong'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-xs text-text-main truncate">
                        {cand.name}
                      </span>
                      {cand.lcsc_part && (
                        <span className="text-[10px] font-mono text-accent bg-accent/10 px-1 rounded">
                          {cand.lcsc_part}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-text-dim mt-1">
                      <span>封装: {cand.package || '-'}</span>
                      <span>分类: {cand.category}</span>
                      <span className="text-emerald-600 font-medium">库存: {cand.quantity}件</span>
                      {cand.location && <span>仓位: {cand.location}</span>}
                    </div>
                  </div>

                  <div
                    className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${
                      isSelected
                        ? 'bg-accent border-accent text-white'
                        : 'border-border-subtle bg-subtle/50'
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Note input & Footer */}
        <div className="p-4 border-t border-border-subtle bg-surface-subtle space-y-3">
          <div>
            <label className="block text-[11px] text-text-dim mb-1 font-medium">
              替代说明与兼容备注（选填）
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例如: Pin-to-Pin 兼容，最大输出电流 500mA"
              className="w-full bg-surface border border-border-subtle rounded-xl px-3 py-1.5 text-xs text-text-main focus:outline-none focus:border-accent"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 rounded-xl text-xs font-medium text-text-dim hover:text-text-main hover:bg-subtle transition-colors"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleBind}
              disabled={!selectedId || submitting}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-accent text-white hover:opacity-90 active:scale-95 transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50"
            >
              <span>确认绑定</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
