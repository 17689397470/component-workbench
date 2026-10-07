import React, { useState, useRef } from 'react';
import { useInventoryStore } from '../../store/useInventoryStore';
import { useToastStore } from '../../store/useToastStore';
import { Modal } from '../ui/Modal';
import { ShoppingCart, UploadCloud, Check } from 'lucide-react';

export const TaobaoImportModal: React.FC = () => {
  const { isTaobaoModalOpen, setTaobaoModalOpen, fetchComponents, fetchStats } = useInventoryStore();
  const { showToast } = useToastStore();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [loading, setLoading] = useState(false);
  const [targetLocation, setTargetLocation] = useState('随手存放处');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleUpload = async () => {
    if (!selectedFile) {
      showToast('请选择淘宝导出的订单 Excel 文件', 'warn');
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('defaultLocation', targetLocation);

    try {
      const res = await fetch('/api/import/taobao', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        showToast(`✔ 成功从淘宝订单导入 ${data.count || 0} 件元器件！`, 'success');
        fetchComponents();
        fetchStats();
        setTaobaoModalOpen(false);
        setSelectedFile(null);
      } else {
        throw new Error(data.error || '导入失败');
      }
    } catch (err: any) {
      showToast('导入异常: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isTaobaoModalOpen}
      onClose={() => setTaobaoModalOpen(false)}
      title={
        <div className="flex items-center gap-2">
          <ShoppingCart className="w-5 h-5 text-accent" />
          <span>🛒 从淘宝订单 Excel 批量导入元器件</span>
        </div>
      }
      maxWidth="max-w-lg"
    >
      <div className="space-y-4 text-xs">
        <p className="text-text-muted leading-relaxed">
          直接上传淘宝“已买到的宝贝”导出的订单明细表，系统将自动识别商品标题中的电阻、电容、芯片封装与规格，秒速批量归档入库。
        </p>

        {/* 文件选择区 */}
        <div
          onClick={() => fileInputRef.current?.click()}
          className="p-6 border-2 border-dashed border-border-subtle hover:border-accent hover:bg-accent/5 rounded-2xl bg-canvas text-center cursor-pointer transition-all"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => e.target.files?.[0] && setSelectedFile(e.target.files[0])}
            className="hidden"
          />
          <UploadCloud className="w-8 h-8 text-accent mx-auto mb-2" />
          <div className="font-semibold text-text-main">
            {selectedFile ? `已选择: ${selectedFile.name}` : '点击选择淘宝订单 Excel 文件 (.xlsx / .csv)'}
          </div>
        </div>

        {/* 默认入库收纳盒 */}
        <div>
          <label className="block text-text-dim mb-1 font-medium">指定批量入库的目标收纳盒</label>
          <input
            type="text"
            value={targetLocation}
            onChange={(e) => setTargetLocation(e.target.value)}
            className="w-full bg-surface border border-border-subtle rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-accent"
            placeholder="例如: 淘宝新到货盒, 随手存放处"
          />
        </div>

        <button
          type="button"
          disabled={loading || !selectedFile}
          onClick={handleUpload}
          className="w-full py-2.5 bg-accent text-white font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-sm hover:opacity-90 disabled:opacity-50 transition-all"
        >
          <Check className="w-4 h-4" />
          <span>{loading ? '正在智能解析入库...' : '确认导入'}</span>
        </button>
      </div>
    </Modal>
  );
};
