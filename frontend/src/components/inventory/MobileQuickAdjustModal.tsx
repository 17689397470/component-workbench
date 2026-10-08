import React, { useState, useEffect } from 'react';
import { ComponentItem } from '../../types/component';
import { componentApi } from '../../api/componentApi';
import { boxApi } from '../../api/boxApi';
import { useToastStore } from '../../store/useToastStore';
import { Modal } from '../ui/Modal';
import {
  Box,
  Navigation,
  CheckCircle2,
  Plus,
  Minus,
  Save,
  Clock,
  Sparkles,
  ArrowRight,
  Package,
} from 'lucide-react';

interface MobileQuickAdjustModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  componentId?: number | null;
  slotName?: string;
  onUpdated?: () => void;
}

export const MobileQuickAdjustModal: React.FC<MobileQuickAdjustModalProps> = ({
  isOpen: controlledIsOpen,
  onClose: controlledOnClose,
  componentId: controlledComponentId,
  slotName: controlledSlotName,
  onUpdated,
}) => {
  const { showToast } = useToastStore();

  // URL 参数自驱动
  const [internalOpen, setInternalOpen] = useState(false);
  const [activeCompId, setActiveCompId] = useState<number | null>(null);
  const [activeSlot, setActiveSlot] = useState<string>('');

  const [comp, setComp] = useState<ComponentItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // 数量变动
  const [currentQty, setCurrentQty] = useState(0);
  const [initialQty, setInitialQty] = useState(0);
  const [adjustReason, setAdjustReason] = useState('');

  // 监听 URL 参数自动唤起快捷盘点
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const isQuick = params.get('quick_adjust') === '1' || params.has('quick');
    const cidStr = params.get('cid') || params.get('component_id');
    const slotStr = params.get('slot') || '';

    if (isQuick && cidStr) {
      const cid = parseInt(cidStr, 10);
      if (!isNaN(cid)) {
        setActiveCompId(cid);
        setActiveSlot(slotStr);
        setInternalOpen(true);
      }
    }
  }, []);

  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalOpen;
  const targetId = controlledComponentId !== undefined ? controlledComponentId : activeCompId;

  const handleClose = () => {
    if (controlledOnClose) {
      controlledOnClose();
    } else {
      setInternalOpen(false);
      // 清除 URL 中的参数避免刷新重复弹出
      if (typeof window !== 'undefined' && window.history.replaceState) {
        const url = new URL(window.location.href);
        url.searchParams.delete('quick_adjust');
        url.searchParams.delete('quick');
        url.searchParams.delete('cid');
        url.searchParams.delete('component_id');
        url.searchParams.delete('slot');
        window.history.replaceState({}, '', url.pathname + (url.search ? url.search : ''));
      }
    }
  };

  const loadComponent = async (id: number) => {
    setLoading(true);
    try {
      const res = await componentApi.getById(id);
      if (res.success && res.data) {
        setComp(res.data);
        setCurrentQty(res.data.quantity);
        setInitialQty(res.data.quantity);
      } else {
        showToast('未能获取该物料详情', 'error');
      }
    } catch (err: any) {
      showToast('获取物料失败: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && targetId) {
      setAdjustReason('');
      loadComponent(targetId);
    }
  }, [isOpen, targetId]);

  const handleAdjustStep = (delta: number) => {
    setCurrentQty((prev) => Math.max(0, prev + delta));
  };

  const handleSave = async () => {
    if (!comp) return;
    const delta = currentQty - initialQty;
    if (delta === 0 && !adjustReason) {
      showToast('库存数量未变动', 'info');
      handleClose();
      return;
    }

    setSaving(true);
    try {
      await componentApi.adjustQuantity(
        comp.id,
        delta,
        adjustReason ? `手机快捷盘点: ${adjustReason}` : '手机扫码盘点下账'
      );
      showToast(
        delta !== 0
          ? `库存已更新: ${delta > 0 ? `+${delta}` : delta} 件`
          : '已保存盘点记录',
        'success'
      );
      if (onUpdated) onUpdated();
      handleClose();
    } catch (err: any) {
      showToast('更新失败: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const slotBadge = controlledSlotName || activeSlot || comp?.location;
  const delta = currentQty - initialQty;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      zIndex={90}
      maxWidth="max-w-md"
      title={
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-accent/15 text-accent flex items-center justify-center font-bold text-xs">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <span className="font-bold text-text-main text-base">工坊扫码快捷盘点 / 领料</span>
        </div>
      }
    >
      {loading ? (
        <div className="py-16 text-center text-xs text-text-dim">正在加载物料信息...</div>
      ) : comp ? (
        <div className="space-y-4">
          {/* 仓位指引卡 */}
          <div className="p-3 bg-canvas border border-border-subtle rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-accent/10 text-accent flex items-center justify-center shrink-0">
                <Box className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] text-text-dim">物理收纳仓位</div>
                <div className="text-xs font-bold text-text-main truncate">
                  {slotBadge || '散料暂存区'}
                </div>
              </div>
            </div>

            <span className="px-2 py-1 rounded-lg bg-subtle text-accent font-mono text-xs font-bold border border-border-subtle shrink-0">
              {comp.category}
            </span>
          </div>

          {/* 元器件核心信息卡 */}
          <div className="p-4 bg-surface border border-border-subtle rounded-2xl space-y-2">
            <h3 className="font-bold text-base text-text-main leading-snug break-words">
              {comp.name}
            </h3>

            <div className="flex flex-wrap items-center gap-1.5 text-xs text-text-dim pt-1">
              {comp.package && (
                <span className="px-2 py-0.5 bg-canvas border border-border-subtle rounded-md font-mono text-[11px] text-text-main">
                  {comp.package}
                </span>
              )}
              {comp.value && (
                <span className="px-2 py-0.5 bg-canvas border border-border-subtle rounded-md font-mono text-[11px] text-text-main">
                  {comp.value}
                </span>
              )}
              {comp.lcsc_part && (
                <span className="px-2 py-0.5 bg-accent/10 border border-accent/20 rounded-md font-mono text-[11px] text-accent font-bold">
                  {comp.lcsc_part}
                </span>
              )}
            </div>
          </div>

          {/* 库存变动核心调整区 */}
          <div className="p-4 bg-canvas border border-border-subtle rounded-2xl space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-text-dim">当前在库余量</span>
              <span className="text-[11px] text-text-dim">
                原库存: <strong className="font-mono text-text-main">{initialQty}</strong> 件
              </span>
            </div>

            {/* 大字数显与调整变动 */}
            <div className="flex items-center justify-center gap-3 py-1">
              <div className="text-center">
                <div className="text-4xl font-black font-mono text-accent">{currentQty}</div>
                <div className="text-[11px] text-text-dim mt-0.5">
                  件
                  {delta !== 0 && (
                    <span
                      className={`ml-1.5 font-bold font-mono ${
                        delta > 0 ? 'text-emerald-500' : 'text-danger'
                      }`}
                    >
                      ({delta > 0 ? `+${delta}` : delta})
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* 常用步进大按键 */}
            <div className="grid grid-cols-4 gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleAdjustStep(-10)}
                className="py-2.5 bg-surface hover:bg-subtle active:scale-95 border border-border-subtle rounded-xl font-mono text-xs font-bold text-text-main transition-transform"
              >
                -10
              </button>
              <button
                type="button"
                onClick={() => handleAdjustStep(-1)}
                className="py-2.5 bg-surface hover:bg-subtle active:scale-95 border border-border-subtle rounded-xl font-mono text-xs font-bold text-text-main transition-transform"
              >
                -1
              </button>
              <button
                type="button"
                onClick={() => handleAdjustStep(1)}
                className="py-2.5 bg-surface hover:bg-subtle active:scale-95 border border-border-subtle rounded-xl font-mono text-xs font-bold text-text-main transition-transform"
              >
                +1
              </button>
              <button
                type="button"
                onClick={() => handleAdjustStep(10)}
                className="py-2.5 bg-surface hover:bg-subtle active:scale-95 border border-border-subtle rounded-xl font-mono text-xs font-bold text-text-main transition-transform"
              >
                +10
              </button>
            </div>

            {/* 变动原因备注 */}
            <div>
              <input
                type="text"
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                placeholder="领料说明 (选填，例: 打板调试用、耗损)"
                className="w-full px-3 py-2 text-xs bg-surface border border-border-subtle rounded-xl text-text-main focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          {/* 底部按钮栏 */}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 py-2.5 px-3 text-xs text-text-muted hover:bg-subtle rounded-xl border border-border-subtle transition-colors"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex-2 py-2.5 px-4 bg-accent hover:bg-accent-hover text-white text-xs font-bold rounded-xl shadow-sm transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? '保存中...' : '确认盘点下账'}</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="py-12 text-center text-xs text-text-dim">未找到相关元器件数据</div>
      )}
    </Modal>
  );
};
