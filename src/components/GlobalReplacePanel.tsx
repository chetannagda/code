import React, { useState } from 'react';
import { RefreshCw, Search, Sparkles, Check } from 'lucide-react';

interface GlobalReplacePanelProps {
  isLightTheme: boolean;
  onRefreshWorkspace?: () => void;
  triggerToast: (text: string, type: 'success' | 'info' | 'error') => void;
}

export default function GlobalReplacePanel({
  isLightTheme,
  onRefreshWorkspace,
  triggerToast,
}: GlobalReplacePanelProps) {
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [languageFilter, setLanguageFilter] = useState('all');
  const [submitting, setSubmitting] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  const handleGlobalReplace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!findText) {
      triggerToast('Search word/phrase is required.', 'info');
      return;
    }

    if (!window.confirm(`Are you absolutely sure you want to search and replace all instances of "${findText}" across your workspace? This operation is irreversible.`)) {
      return;
    }

    setSubmitting(true);
    setResultMessage(null);
    try {
      const res = await fetch('/api/fs/replace-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ findText, replaceText, languageFilter }),
      });
      const data = await res.json();
      if (res.ok) {
        triggerToast('Workspace edited successfully.', 'success');
        setResultMessage(data.message || 'Operation succeeded.');
        if (onRefreshWorkspace) {
          onRefreshWorkspace();
        }
      } else {
        triggerToast(data.error || 'Replace failed', 'error');
      }
    } catch {
      triggerToast('Error during bulk replace operation.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={`flex flex-col h-full w-full select-none ${
      isLightTheme ? 'bg-slate-50 text-slate-800' : 'bg-[#252526] text-slate-300'
    }`}>
      {/* Header */}
      <div className={`p-3 border-b flex items-center justify-between ${isLightTheme ? 'border-slate-200' : 'border-slate-800'}`}>
        <span className="text-[10px] font-mono tracking-widest uppercase opacity-60">BULK FIND & REPLACE</span>
        <RefreshCw className={`w-3.5 h-3.5 text-blue-400 ${submitting ? 'animate-spin' : ''}`} />
      </div>

      <form onSubmit={handleGlobalReplace} className="p-4 flex flex-col gap-4 overflow-y-auto flex-grow justify-start">
        <p className="text-[11px] opacity-60 font-sans leading-relaxed">
          Search and swap terms/functions instantly in multiple files across unlimited folders in your workspace tree.
        </p>

        <div>
          <label className="block text-[10px] font-mono uppercase tracking-wider opacity-60 mb-1">Find String</label>
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 absolute left-3 text-slate-400" />
            <input
              type="text"
              required
              placeholder="Case-sensitive word (e.g., oldFunction)"
              value={findText}
              onChange={e => setFindText(e.target.value)}
              className={`w-full text-xs pl-8 pr-3 py-2 rounded border focus:border-blue-500 outline-none font-mono ${
                isLightTheme ? 'bg-white border-slate-300 text-slate-900' : 'bg-[#1e1e1e] border-slate-700 text-slate-100'
              }`}
            />
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-mono uppercase tracking-wider opacity-60 mb-1">Replace With</label>
          <input
            type="text"
            placeholder="New string (e.g., newFunction)"
            value={replaceText}
            onChange={e => setReplaceText(e.target.value)}
            className={`w-full text-xs p-2 rounded border focus:border-blue-500 outline-none font-mono ${
              isLightTheme ? 'bg-white border-[#ccc] text-slate-900' : 'bg-[#1e1e1e] border-slate-700 text-slate-100'
            }`}
          />
        </div>

        <div>
          <label className="block text-[10px] font-mono uppercase tracking-wider opacity-60 mb-1">Restrict Scope by Language</label>
          <select
            value={languageFilter}
            onChange={e => setLanguageFilter(e.target.value)}
            className={`w-full text-xs p-2 rounded border focus:border-blue-500 outline-none font-mono ${
              isLightTheme ? 'bg-white border-slate-300 text-slate-800' : 'bg-[#1e1e1e] border-slate-700 text-slate-300'
            }`}
          >
            <option value="all">All File Formats</option>
            {['javascript', 'typescript', 'python', 'json', 'html', 'css', 'markdown', 'shell', 'robot'].map(lang => (
              <option key={lang} value={lang}>{lang.toUpperCase()}</option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          disabled={submitting || !findText}
          className={`w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-mono tracking-widest font-bold shadow transition-colors flex items-center justify-center gap-2 ${
            submitting ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          {submitting ? 'EXECUTING TRANSACTION...' : 'BULK SWAP PHRASE'}
        </button>

        {resultMessage && (
          <div className="mt-2 p-3 bg-emerald-600/10 border border-emerald-500/20 text-emerald-400 font-mono rounded text-[11px] flex items-start gap-2 animate-fade-in">
            <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>{resultMessage}</span>
          </div>
        )}
      </form>
    </div>
  );
}
