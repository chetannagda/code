import React, { useState, useEffect } from 'react';
import { Lock, ShieldAlert, KeyRound, ArrowRight, Loader2, Database } from 'lucide-react';

interface AuthPageProps {
  onAuthSuccess: (user: { id: string; username: string }) => void;
  isLightTheme: boolean;
}

export default function AuthPage({ onAuthSuccess, isLightTheme }: AuthPageProps) {
  const [isBootstrapped, setIsBootstrapped] = useState<boolean | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check setup status
  useEffect(() => {
    checkBootstrapStatus();
  }, []);

  const checkBootstrapStatus = async () => {
    try {
      const response = await fetch('/api/auth/status');
      const data = await response.json();
      if (response.ok) {
        setIsBootstrapped(data.bootstrapped);
      } else {
        setError(data.error || 'Failed to detect security status.');
      }
    } catch (err) {
      setError('Cannot connect to full-stack server. Is it starting? Please wait...');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Please fill in all security fields.');
      return;
    }

    if (isBootstrapped === false && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    setError(null);

    const endpoint = isBootstrapped ? '/api/auth/login' : '/api/auth/bootstrap';

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        if (data.token) {
          localStorage.setItem('codevault-token', data.token);
        }
        onAuthSuccess({ id: data.user.id, username: data.user.username });
      } else {
        setError(data.error || 'Authentication challenge failed.');
      }
    } catch (err) {
      setError('Network communication failed. Please run server check.');
    } finally {
      setLoading(false);
    }
  };

  if (isBootstrapped === null) {
    return (
      <div className={`flex flex-col items-center justify-center min-h-screen ${isLightTheme ? 'bg-slate-50 text-slate-900' : 'bg-[#1e1e1e] text-slate-100'}`}>
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="w-12 h-12 animate-spin text-blue-500" />
          <p className="text-sm font-mono tracking-wider opacity-70">Securing CodeVault session...</p>
        </div>
      </div>
    );
  }

  return (
    <div id="auth-page-container" className={`flex items-center justify-center min-h-screen px-4 font-sans relative overflow-hidden ${
      isLightTheme ? 'bg-slate-100 light-grid-bg' : 'bg-[#121212] coder-grid-bg'
    }`}>
      {/* Retro-analog CRT trace lines */}
      <div className="absolute inset-0 scanline-overlay opacity-[0.25] pointer-events-none" />

      <div className={`w-full max-w-md p-8 rounded-xl shadow-[0_0_35px_rgba(59,130,246,0.15)] border transition-all relative z-10 ${
        isLightTheme ? 'bg-white border-slate-200' : 'bg-[#1b1b1c] border-slate-700/65'
      }`}>
        {/* Brand Icon Header */}
        <div className="flex flex-col items-center text-center space-y-3 mb-6">
          <div className="p-3 bg-blue-500/10 rounded-xl text-blue-500 border border-blue-500/30">
            <Database className="w-8 h-8" />
          </div>
          <h1 className={`text-2xl font-bold tracking-tight font-sans ${isLightTheme ? 'text-slate-950' : 'text-slate-50'}`}>
            CodeVault
          </h1>
          <p className="text-xs font-mono tracking-wide px-2 py-0.5 rounded bg-slate-500/10 text-slate-400">
            v1.0.0 Secure Sandbox
          </p>
        </div>

        {/* Security Announcement Banner */}
        {isBootstrapped === false ? (
          <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs leading-relaxed text-amber-500 flex items-start space-x-3">
            <ShieldAlert className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold font-mono uppercase mb-1">Master Setup Pending</p>
              <p>Welcome! CodeVault is currently unregistered. Please initialize your security credentials. These will represent the master credentials for your personal sandbox database.</p>
            </div>
          </div>
        ) : (
          <div className="mb-6 border-b border-dashed border-slate-500/20 pb-4 text-center">
            <p className="text-sm text-slate-400">Authenticate credentials to unlock personal workspace files.</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-500/15 border border-red-500/20 text-xs text-red-400 rounded-lg text-center font-mono">
              {error}
            </div>
          )}

          <div>
            <label className={`block text-xs font-mono uppercase tracking-widest mb-1.5 ${isLightTheme ? 'text-slate-600' : 'text-slate-400'}`}>
              Master Username
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="auth-username-input"
                type="text"
                required
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoComplete="username"
                className={`w-full pl-10 pr-4 py-2 text-sm rounded-lg border outline-none transition-all ${
                  isLightTheme
                    ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-blue-500 focus:bg-white'
                    : 'bg-[#1e1e1e] border-slate-700 text-slate-100 focus:border-blue-500 focus:bg-[#1e1e1e]'
                }`}
                placeholder="e.g. administrator"
              />
            </div>
          </div>

          <div>
            <label className={`block text-xs font-mono uppercase tracking-widest mb-1.5 ${isLightTheme ? 'text-slate-600' : 'text-slate-400'}`}>
              Master Password
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="auth-password-input"
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                className={`w-full pl-10 pr-4 py-2 text-sm rounded-lg border outline-none transition-all ${
                  isLightTheme
                    ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-blue-500 focus:bg-white'
                    : 'bg-[#1e1e1e] border-slate-700 text-slate-100 focus:border-blue-500 focus:bg-[#1e1e1e]'
                }`}
                placeholder="Your secret passphrase"
              />
            </div>
          </div>

          {isBootstrapped === false && (
            <div>
              <label className={`block text-xs font-mono uppercase tracking-widest mb-1.5 ${isLightTheme ? 'text-slate-600' : 'text-slate-400'}`}>
                Confirm Password
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="auth-confirm-password-input"
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  className={`w-full pl-10 pr-4 py-2 text-sm rounded-lg border outline-none transition-all ${
                    isLightTheme
                      ? 'bg-slate-50 border-slate-300 text-slate-900 focus:border-blue-500 focus:bg-white'
                      : 'bg-[#1e1e1e] border-slate-700 text-slate-100 focus:border-blue-500 focus:bg-[#1e1e1e]'
                  }`}
                  placeholder="Verify password"
                />
              </div>
            </div>
          )}

          <button
            id="auth-submit-btn"
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-2.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-medium rounded-lg text-sm transition-all flex items-center justify-center space-x-2 shadow-lg shadow-blue-600/15 group disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <span className="font-semibold tracking-wide">
                  {isBootstrapped ? 'Unlock Sandbox' : 'Initialize CodeVault'}
                </span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </form>

        <div className="mt-8 text-center border-t border-slate-500/10 pt-4">
          <p className="text-[10px] font-mono text-slate-500">
            AES-256 equivalent standard protection rules. Only secure master connections accepted.
          </p>
        </div>
      </div>
    </div>
  );
}
