import React, { useEffect, useState } from 'react';
import { useInventoryStore } from '../../store/useInventoryStore';
import { useToastStore } from '../../store/useToastStore';
import { componentApi } from '../../api/componentApi';
import { ComponentItem } from '../../types/component';
import { Drawer } from '../ui/Drawer';
import { ExternalLink, Trash2, Plus, Minus, Save, Box } from 'lucide-react';

export const ComponentDetailDrawer: React.FC = () => {
  const { selectedComponentId, setSelectedComponentId, fetchComponents, fetchStats } =
    useInventoryStore();
  const { showToast } = useToastStore();

  const [item, setItem] = useState<ComponentItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [editingNotes, setEditingNotes] = useState('');
  const [editingLocation, setEditingLocation] = useState('');
  const [editingQty, setEditingQty] = useState(0);

  useEffect(() => {
    if (!selectedComponentId) {
      setItem(null);
      return;
    }

    setLoading(true);
    componentApi
      .getById(selectedComponentId)
      .then((res) => {
        if (res.success && res.data) {
          setItem(res.data);
          setEditingNotes(res.data.notes || '');
          setEditingLocation(res.data.location || '');
          setEditingQty(res.data.quantity);
        }
      })
      .catch((err) => {
        showToast('获取物料详情失败: ' + err.message, 'error');
      })
      .finally(() => setLoading(false));
  }, [selectedComponentId]);

  const handleSave = async () => {
    if (!item) return;
    try {
      await componentApi.update(item.id, {
        notes: editingNotes,
        location: editingLocation,
        quantity: editingQty,
      });
      showToast('已更新物料信息', 'success');
      fetchComponents();
      fetchStats();
      setSelectedComponentId(null);
    } catch (err: any) {
      showToast('保存失败: ' + err.message, 'error');
    }
  };

  const handleDelete = async () => {
    if (!item || !window.confirm(`确认删除元器件 "${item.name}" 吗？此操作无法撤销。`)) return;
    try {
      await componentApi.delete(item.id);
      showToast('已删除元器件', 'success');
      fetchComponents();
      fetchStats();
      setSelectedComponentId(null);
    } catch (err: any) {
      showToast('删除失败: ' + err.message, 'error');
    }
  };

  const cNum = item?.lcsc_part ? item.lcsc_part.toUpperCase().trim() : null;
  const lcscUrl =
    item?.datasheet_url || (cNum ? `https://item.szlcsc.com/${cNum.replace('C', '')}.html` : null);

  return (
    <Drawer
      isOpen={!!selectedComponentId}
      onClose={() => setSelectedComponentId(null)}
      title={item?.name || '元器件详情'}
      subtitle={item?.category ? `分类: ${item.category}` : undefined}
      footer={
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={handleDelete}
            className="text-xs text-rose-500 hover:text-rose-600 flex items-center gap-1 px-3 py-2 rounded-xl hover:bg-rose-50 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>删除物料</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            className="bg-accent text-white font-semibold text-xs px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
          >
            <Save className="w-3.5 h-3.5" />
            <span>保存变更</span>
          </button>
        </div>
      }
    >
      {loading ? (
        <div className="py-20 text-center text-text-dim text-xs">加载规格中...</div>
      ) : item ? (
        <div className="space-y-5 text-xs">
          {/* 实物图与立创直达 */}
          {item.image_url && (
            <div className="w-full h-44 bg-canvas border border-border-subtle rounded-2xl flex items-center justify-center p-3 overflow-hidden">
              <img
                src={item.image_url}
                alt={item.name}
                className="max-h-full max-w-full object-contain mix-blend-multiply dark:mix-blend-normal"
              />
            </div>
          )}

          {/* 立创 C 编号与官方规格书 */}
          {cNum && lcscUrl && (
            <div className="p-3 bg-accent/5 border border-accent/20 rounded-xl flex items-center justify-between">
              <div>
                <div className="text-[10px] text-accent font-semibold">立创商城物料编号</div>
                <div className="text-sm font-bold font-mono text-accent">{cNum}</div>
              </div>
              <a
                href={lcscUrl}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 bg-accent text-white font-medium text-xs rounded-lg flex items-center gap-1 hover:opacity-90 shadow-sm"
              >
                <span>官方规格书</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}

          {/* 核心电气与机械参数网格 */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="p-2.5 bg-subtle/50 rounded-xl border border-border-subtle">
              <span className="text-[10px] text-text-dim">封装</span>
              <div className="font-mono font-semibold text-text-main mt-0.5">
                {item.package || '-'}
              </div>
            </div>
            <div className="p-2.5 bg-subtle/50 rounded-xl border border-border-subtle">
              <span className="text-[10px] text-text-dim">阻值 / 容值</span>
              <div className="font-mono font-semibold text-text-main mt-0.5">{item.value || '-'}</div>
            </div>
            <div className="p-2.5 bg-subtle/50 rounded-xl border border-border-subtle">
              <span className="text-[10px] text-text-dim">容差</span>
              <div className="text-text-main mt-0.5">{item.tolerance || '-'}</div>
            </div>
            <div className="p-2.5 bg-subtle/50 rounded-xl border border-border-subtle">
              <span className="text-[10px] text-text-dim">额定耐压</span>
              <div className="text-text-main mt-0.5">{item.voltage ? `${item.voltage}V` : '-'}</div>
            </div>
          </div>

          {/* 存放位置修改 */}
          <div>
            <label className="block text-text-dim mb-1 font-medium">📦 存放收纳盒位置</label>
            <div className="relative">
              <input
                type="text"
                value={editingLocation}
                onChange={(e) => setEditingLocation(e.target.value)}
                className="w-full bg-surface border border-border-subtle rounded-xl px-3 py-2 text-xs text-text-main focus:outline-none focus:border-accent"
                placeholder="例如: 默认电阻盒, 抽屉A-01"
              />
            </div>
          </div>

          {/* 库存件数步进调整 */}
          <div>
            <label className="block text-text-dim mb-1 font-medium">现有库存数量</label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setEditingQty((q) => Math.max(0, q - 10))}
                className="w-9 h-9 rounded-xl bg-subtle hover:bg-surface-hover border border-border-subtle flex items-center justify-center text-text-main"
              >
                <Minus className="w-4 h-4" />
              </button>
              <input
                type="number"
                value={editingQty}
                onChange={(e) => setEditingQty(parseInt(e.target.value, 10) || 0)}
                className="flex-1 bg-surface border border-border-subtle rounded-xl px-3 py-2 text-center text-sm font-mono font-bold text-text-main focus:outline-none focus:border-accent"
              />
              <button
                type="button"
                onClick={() => setEditingQty((q) => q + 10)}
                className="w-9 h-9 rounded-xl bg-subtle hover:bg-surface-hover border border-border-subtle flex items-center justify-center text-text-main"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* 备注 / 选用建议 */}
          <div>
            <label className="block text-text-dim mb-1 font-medium">备注与应用场景</label>
            <textarea
              rows={3}
              value={editingNotes}
              onChange={(e) => setEditingNotes(e.target.value)}
              className="w-full bg-surface border border-border-subtle rounded-xl p-3 text-xs text-text-main focus:outline-none focus:border-accent resize-none"
              placeholder="例如: 常用LED限流, I2C总线上拉电阻..."
            />
          </div>
        </div>
      ) : null}
    </Drawer>
  );
};
