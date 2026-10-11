import React, { useState, useEffect } from 'react';
import { Lock, Key, ShieldCheck, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { getStoredToken, setStoredToken, clearStoredToken } from '../../api/client';

export const AuthModal: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const checkAuthStatus = async () => {
    try {
      const res = await fetch('/api/auth/status');
      const data = await res.json();
      if (data.auth_required) {
        const token = getStoredToken();
        if (!token) {
          setIsOpen(true);
        } else {
          // 验证现有 token 是否依然有效
          const testRes = await fetch('/api/components?limit=1', {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (testRes.status === 401) {
            clearStoredToken();
            setIsOpen(true);
          }
        }
      }
    } catch (e) {
      // 忽略网络断开时的初始检查错误
    }
  };

  useEffect(() => {
    checkAuthStatus();

    const handleAuthRequired = () => {
      clearStoredToken();
      setIsOpen(true);
      setError('登录凭证已过期或密码已更新，请重新输入');
    };

    window.addEventListener('bom:auth_required', handleAuthRequired);
    return () => window.removeEventListener('bom:auth_required', handleAuthRequired);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setError('请输入访问密码');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: password.trim() })
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || '访问密码错误，请核对后重试');
        setIsLoading(false);
        return;
      }

      setStoredToken(data.token);
      setIsOpen(false);
      setPassword('');
      // 触发全站数据刷新
      window.location.reload();
    } catch (err: any) {
      setError('服务器连接失败，请检查网络或后端服务');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-card w-full max-w-md rounded-2xl border border-border shadow-2xl p-6 sm:p-8 space-y-6">
        {/* 头部图标与标题 */}
        <div className="text-center space-y-2">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shadow-inner">
            <Lock className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold tracking-tight text-text-main flex items-center justify-center gap-2">
            安全访问验证
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-mono font-medium">
              ACCESS_PASSWORD
            </span>
          </h2>
          <p className="text-sm text-text-muted">
            当前系统处于公网环境，请输入访问密码以解锁元器件仓库
          </p>
        </div>

        {/* 错误提示条 */}
        {error && (
          <div className="flex items-center gap-2 text-sm text-red-500 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-xl">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* 表单输入 */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-text-muted uppercase tracking-wider block">
              访问密码
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-text-muted">
                <Key className="w-4 h-4" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError('');
                }}
                placeholder="请输入服务器配置的访问密码..."
                autoFocus
                className="w-full pl-10 pr-10 py-2.5 bg-input-bg border border-border rounded-xl text-text-main placeholder:text-text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-text-muted hover:text-text-main transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 px-4 bg-primary hover:bg-primary-hover active:scale-[0.99] text-white rounded-xl font-medium text-sm transition-all shadow-md shadow-primary/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
          >
            {isLoading ? (
              <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <ShieldCheck className="w-4 h-4" />
            )}
            <span>{isLoading ? '正在验证...' : '解锁并进入工作台'}</span>
          </button>
        </form>

        {/* 底部安全说明 */}
        <div className="pt-2 border-t border-border/50 text-center text-xs text-text-muted">
          💡 验证成功后浏览器将记住此凭据，无需重复输入
        </div>
      </div>
    </div>
  );
};
