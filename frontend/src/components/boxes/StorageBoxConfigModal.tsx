import React, { useState, useEffect } from 'react';
import { StorageBoxConfig, BoxType, SlotNaming } from '../../types/box';
import { boxApi } from '../../api/boxApi';
import { useToastStore } from '../../store/useToastStore';
import { Modal } from '../ui/Modal';
import {
  Box,
  Grid,
  BookOpen,
  Archive,
  Palette,
  Check,
  Sparkles,
  Trash2,
} from 'lucide-react';

interface StorageBoxConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  box?: StorageBoxConfig | null;
  onSaved: () => void;
}

const PRESET_TEMPLATES = [
  {
    label: '3×4 迷你抽屉柜 (12格)',
    type: 'GRID' as BoxType,
    rows: 3,
    cols: 4,
    pages: 1,
    naming: 'LETTER_NUM' as SlotNaming,
    color: '#3B82F6',
    desc: '常见桌面 12 抽屉透明收纳箱',
  },
  {
    label: '4×6 经典亚克力盒 (24格)',
    type: 'GRID' as BoxType,
    rows: 4,
    cols: 6,
    pages: 1,
    naming: 'LETTER_NUM' as SlotNaming,
    color: '#10B981',
    desc: '标准 24 格阻容贴片收纳盒 (A1-D6)',
  },
  {
    label: '5×6 中型元器件柜 (30格)',
    type: 'GRID' as BoxType,
    rows: 5,
    cols: 6,
    pages: 1,
    naming: 'LETTER_NUM' as SlotNaming,
    color: '#F59E0B',
    desc: '五层 30 抽屉塑料五金柜',
  },
  {
    label: '6×10 密集贴片储物柜 (60格)',
    type: 'GRID' as BoxType,
    rows: 6,
    cols: 10,
    pages: 1,
    naming: 'LETTER_NUM' as SlotNaming,
    color: '#8B5CF6',
    desc: '大容量贴片收纳立柜 (A1-F10)',
  },
  {
    label: '阻容样品册 (每页20格, 20页)',
    type: 'BOOK' as BoxType,
    rows: 4,
    cols: 5,
    pages: 20,
    naming: 'NUM' as SlotNaming,
    color: '#EC4899',
    desc: '活页贴片电阻/电容样品本 (P01-01)',
  },
  {
    label: '普通随手盒 / 静电袋',
    type: 'BIN' as BoxType,
    rows: 1,
    cols: 1,
    pages: 1,
    naming: 'FREE' as SlotNaming,
    color: '#6B7280',
    desc: '无固定网格，散料随手存放',
  },
];

const COLOR_PALETTE = [
  { name: '科技蓝', hex: '#3B82F6' },
  { name: '薄荷绿', hex: '#10B981' },
  { name: '活力橙', hex: '#F59E0B' },
  { name: '极客紫', hex: '#8B5CF6' },
  { name: '樱花粉', hex: '#EC4899' },
  { name: '工业灰', hex: '#6B7280' },
  { name: '深邃黑', hex: '#1E293B' },
  { name: '青莲色', hex: '#06B6D4' },
];

export const StorageBoxConfigModal: React.FC<StorageBoxConfigModalProps> = ({
  isOpen,
  onClose,
  box,
  onSaved,
}) => {
  const { showToast } = useToastStore();
  const [submitting, setSubmitting] = useState(false);

  // 表单状态
  const [name, setName] = useState('');
  const [boxType, setBoxType] = useState<BoxType>('GRID');
  const [rows, setRows] = useState(4);
  const [cols, setCols] = useState(6);
  const [pages, setPages] = useState(1);
  const [slotNaming, setSlotNaming] = useState<SlotNaming>('LETTER_NUM');
  const [color, setColor] = useState('#3B82F6');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (box) {
      setName(box.name || '');
      setBoxType(box.box_type || 'GRID');
      setRows(box.rows || 4);
      setCols(box.cols || 6);
      setPages(box.pages || 1);
      setSlotNaming(box.slot_naming || 'LETTER_NUM');
      setColor(box.color || '#3B82F6');
      setDescription(box.description || '');
    } else {
      setName('');
      setBoxType('GRID');
      setRows(4);
      setCols(6);
      setPages(1);
      setSlotNaming('LETTER_NUM');
      setColor('#3B82F6');
      setDescription('');
    }
  }, [box, isOpen]);

  const handleApplyTemplate = (tpl: typeof PRESET_TEMPLATES[0]) => {
    setBoxType(tpl.type);
    setRows(tpl.rows);
    setCols(tpl.cols);
    setPages(tpl.pages);
    setSlotNaming(tpl.naming);
    setColor(tpl.color);
    if (!description) setDescription(tpl.desc);
    if (!name && box == null) {
      setName(tpl.label.split(' ')[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast('请输入收纳盒名称', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const payload: Partial<StorageBoxConfig> = {
        id: box?.id || undefined,
        name: name.trim(),
        box_type: boxType,
        rows: boxType === 'BIN' ? 1 : rows,
        cols: boxType === 'BIN' ? 1 : cols,
        pages: boxType === 'BOOK' ? pages : 1,
        slot_naming: slotNaming,
        color,
        description: description.trim(),
      };

      const res = await boxApi.saveBoxConfig(payload);
      if (res.success) {
        showToast(box ? '收纳盒配置已更新' : '已成功创建收纳盒', 'success');
        onSaved();
        onClose();
      } else {
        showToast('保存失败', 'error');
      }
    } catch (err: any) {
      showToast('保存失败: ' + err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!box?.id) return;
    if (!window.confirm(`确定要删除收纳盒【${box.name}】的物理网格配置吗？（不会删除库中的元器件，仅清除规格定义）`)) {
      return;
    }

    try {
      const res = await boxApi.deleteBoxConfig(box.id);
      if (res.success) {
        showToast('收纳盒配置已删除', 'success');
        onSaved();
        onClose();
      }
    } catch (err: any) {
      showToast('删除失败: ' + err.message, 'error');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={box ? `⚙️ 配置收纳盒: ${box.name}` : '✨ 新建物理收纳空间'}
      maxWidth="max-w-xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* 预设模板选单 */}
        {!box && (
          <div>
            <label className="block text-xs font-semibold text-text-muted mb-2 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-accent" />
              <span>快速套用工坊常见规格模板</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {PRESET_TEMPLATES.map((tpl, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleApplyTemplate(tpl)}
                  className="p-2 text-left rounded-xl border border-border-subtle bg-canvas hover:border-accent hover:bg-subtle/50 transition-all text-xs group"
                >
                  <div className="font-semibold text-text-main group-hover:text-accent truncate">
                    {tpl.label.split(' ')[0]}
                  </div>
                  <div className="text-[10px] text-text-dim mt-0.5 truncate">{tpl.desc}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 基础信息 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-text-muted mb-1">
              收纳盒名称 <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例：4x6 电阻盒 或 0805贴片本"
              required
              className="w-full px-3 py-2 text-xs bg-canvas border border-border-subtle rounded-xl text-text-main focus:outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-muted mb-1">物理形态类型</label>
            <div className="flex rounded-xl bg-canvas border border-border-subtle p-0.5">
              <button
                type="button"
                onClick={() => setBoxType('GRID')}
                className={`flex-1 py-1.5 text-xs font-medium rounded-lg flex items-center justify-center gap-1 transition-all ${
                  boxType === 'GRID' ? 'bg-surface text-accent shadow-sm font-bold' : 'text-text-muted'
                }`}
              >
                <Grid className="w-3.5 h-3.5" />
                网格抽屉
              </button>
              <button
                type="button"
                onClick={() => setBoxType('BOOK')}
                className={`flex-1 py-1.5 text-xs font-medium rounded-lg flex items-center justify-center gap-1 transition-all ${
                  boxType === 'BOOK' ? 'bg-surface text-accent shadow-sm font-bold' : 'text-text-muted'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                样品本
              </button>
              <button
                type="button"
                onClick={() => setBoxType('BIN')}
                className={`flex-1 py-1.5 text-xs font-medium rounded-lg flex items-center justify-center gap-1 transition-all ${
                  boxType === 'BIN' ? 'bg-surface text-accent shadow-sm font-bold' : 'text-text-muted'
                }`}
              >
                <Archive className="w-3.5 h-3.5" />
                随手盒
              </button>
            </div>
          </div>
        </div>

        {/* 规格矩阵配置 */}
        {boxType !== 'BIN' && (
          <div className="p-3 bg-canvas border border-border-subtle rounded-xl space-y-3">
            <div className="text-xs font-semibold text-text-main flex items-center justify-between">
              <span>网格与阵列参数</span>
              <span className="text-[11px] text-accent font-mono">
                {boxType === 'BOOK'
                  ? `共 ${pages} 页 × 每页 ${rows * cols} 格 = ${pages * rows * cols} 格`
                  : `总容量: ${rows * cols} 格位 (${rows}行 × ${cols}列)`}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div>
                <label className="block text-[11px] text-text-muted mb-1">行数 (Rows)</label>
                <input
                  type="number"
                  min="1"
                  max="26"
                  value={rows}
                  onChange={(e) => setRows(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full px-2.5 py-1.5 text-xs bg-surface border border-border-subtle rounded-lg text-text-main focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-[11px] text-text-muted mb-1">列数 (Cols)</label>
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={cols}
                  onChange={(e) => setCols(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full px-2.5 py-1.5 text-xs bg-surface border border-border-subtle rounded-lg text-text-main focus:outline-none focus:border-accent"
                />
              </div>

              {boxType === 'BOOK' && (
                <div>
                  <label className="block text-[11px] text-text-muted mb-1">总页数 (Pages)</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={pages}
                    onChange={(e) => setPages(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full px-2.5 py-1.5 text-xs bg-surface border border-border-subtle rounded-lg text-text-main focus:outline-none focus:border-accent"
                  />
                </div>
              )}

              <div>
                <label className="block text-[11px] text-text-muted mb-1">格位编码规则</label>
                <select
                  value={slotNaming}
                  onChange={(e) => setSlotNaming(e.target.value as SlotNaming)}
                  className="w-full px-2 py-1.5 text-xs bg-surface border border-border-subtle rounded-lg text-text-main focus:outline-none focus:border-accent"
                >
                  <option value="LETTER_NUM">字母+数字 (A1-D6)</option>
                  <option value="NUM_NUM">行-列 (1-1, 1-2)</option>
                  <option value="NUM">纯流水号 (1, 2, 3..)</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* 配色与说明 */}
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-text-muted mb-1.5 flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5 text-text-muted" />
              <span>辨识标识色</span>
            </label>
            <div className="flex flex-wrap gap-2 items-center">
              {COLOR_PALETTE.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  onClick={() => setColor(c.hex)}
                  className="w-6 h-6 rounded-full flex items-center justify-center transition-transform hover:scale-110 relative"
                  style={{ backgroundColor: c.hex }}
                  title={c.name}
                >
                  {color.toLowerCase() === c.hex.toLowerCase() && (
                    <Check className="w-3.5 h-3.5 text-white stroke-[3]" />
                  )}
                </button>
              ))}
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-7 h-7 rounded-lg border-0 cursor-pointer p-0 bg-transparent"
                title="自定义拾色器"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-muted mb-1">备注说明</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="例：位于工坊左侧架第二层，主放 0805 阻容"
              className="w-full px-3 py-2 text-xs bg-canvas border border-border-subtle rounded-xl text-text-main focus:outline-none focus:border-accent"
            />
          </div>
        </div>

        {/* 底部按钮栏 */}
        <div className="pt-3 border-t border-border-subtle flex items-center justify-between">
          {box?.id ? (
            <button
              type="button"
              onClick={handleDelete}
              className="px-3 py-1.5 text-xs text-danger hover:bg-danger/10 rounded-xl transition-all flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              删除配置
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs text-text-muted hover:bg-subtle rounded-xl transition-all"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-1.5 text-xs font-semibold bg-accent text-white hover:bg-accent-hover rounded-xl shadow-sm transition-all disabled:opacity-50"
            >
              {submitting ? '保存中...' : '确认保存'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
};
