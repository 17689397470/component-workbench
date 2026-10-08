import React, { useState, useEffect } from 'react';
import { SubstituteRule } from '../types/bom';
import { bomApi } from '../api/bomApi';
import { useToastStore } from '../store/useToastStore';
import { ShieldCheck, Trash2, X, AlertCircle } from 'lucide-react';

interface SubstituteRulesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRulesChanged?: () => void;
}

export const SubstituteRulesModal: React.FC<SubstituteRulesModalProps> = ({
  isOpen,
  onClose,
  onRulesChanged,
}) => {
  const { showToast } = useToastStore();
  const [rules, setRules] = useState<SubstituteRule[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadRules();
    }
  }, [isOpen]);

  const loadRules = async () => {
    setLoading(true);
    try {
      const res = await bomApi.getRules();
      if (res.success && res.data) {
        setRules(res.data);
      }
    } catch (err: any) {
      showToast('获取规则失败: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await bomApi.deleteRule(id);
      setRules((prev) => prev.filter((r) => r.id !== id));
      showToast('✔ 已删除该替代偏好规则', 'success');
      onRulesChanged?.();
    } catch (err: any) {
      showToast('删除失败: ' + err.message, 'error');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-surface border border-border-subtle rounded-2xl w-full max-w-xl shadow-xl overflow-hidden flex flex-col max-h-[80vh]">
        {/* 顶部标题栏 */}
        <div className="px-5 py-4 border-b border-border-subtle flex items-center justify-between bg-canvas/40">
          <div>
            <h3 className="text-sm font-bold text-text-main flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-accent" />
              <span>常用物料替代规则管理</span>
            </h3>
            <p className="text-xs text-text-muted mt-0.5">
              比对 BOM 时系统将优先应用此处沉淀的高置信替代规则
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

        {/* 规则列表 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading && (
            <div className="py-12 text-center text-xs text-text-dim">加载规则库中...</div>
          )}

          {!loading && rules.length === 0 && (
            <div className="py-12 text-center text-xs text-text-dim">
              暂未记录任何自定义替代偏好。在比对结果中为缺料指定替代时勾选“记住规则”即可沉淀。
            </div>
          )}

          {!loading &&
            rules.map((r) => (
              <div
                key={r.id}
                className="p-3 bg-canvas border border-border-subtle rounded-xl flex items-center justify-between gap-3 text-xs"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-text-main font-mono">{r.target_part}</span>
                    <span className="text-text-dim">➔</span>
                    <span className="font-semibold text-accent font-mono">{r.substitute_name}</span>
                  </div>
                  {r.note && (
                    <div className="text-[11px] text-text-muted mt-1 truncate">
                      💡 {r.note}
                    </div>
                  )}
                  {r.created_at && (
                    <div className="text-[10px] text-text-dim mt-0.5 font-mono">
                      记录于: {new Date(r.created_at).toLocaleDateString()}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => handleDelete(r.id)}
                  title="删除此规则"
                  className="p-1.5 text-text-muted hover:text-rose-600 hover:bg-rose-500/10 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
        </div>

        {/* 底部关闭 */}
        <div className="p-4 border-t border-border-subtle bg-canvas/40 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-subtle hover:bg-surface-hover rounded-xl text-xs font-medium text-text-main transition-colors"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};
