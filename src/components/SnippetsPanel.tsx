import React, { useState, useEffect } from 'react';
import { Bookmark, Search, Plus, Trash2, Code, ArrowLeftRight } from 'lucide-react';
import { Snippet } from '../types';

interface SnippetsPanelProps {
  isLightTheme: boolean;
  activeFileId: string | null;
  onRefreshWorkspace?: () => void;
  triggerToast: (text: string, type: 'success' | 'info' | 'error') => void;
}

export default function SnippetsPanel({
  isLightTheme,
  activeFileId,
  onRefreshWorkspace,
  triggerToast,
}: SnippetsPanelProps) {
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);

  // New snippet form state
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [language, setLanguage] = useState('plaintext');

  const fetchSnippets = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/snippets?search=${encodeURIComponent(searchQuery)}`);
      if (res.ok) {
        const data = await res.json();
        setSnippets(data || []);
      }
    } catch {
      triggerToast('Unable to fetch snippets list', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSnippets();
  }, [searchQuery]);

  const handleCreateSnippet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !content.trim()) {
      triggerToast('Name and content are required.', 'info');
      return;
    }

    try {
      const res = await fetch('/api/snippets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, content, language }),
      });
      if (res.ok) {
        triggerToast('Snippet saved successfully!', 'success');
        setName('');
        setContent('');
        setIsAdding(false);
        fetchSnippets();
      } else {
        const errorData = await res.json();
        triggerToast(errorData.error || 'Failed to save snippet', 'error');
      }
    } catch {
      triggerToast('Error connecting to snippets server', 'error');
    }
  };

  const handleDeleteSnippet = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this snippet?')) return;

    try {
      const res = await fetch(`/api/snippets/${id}`, { method: 'DELETE' });
      if (res.ok) {
        triggerToast('Snippet deleted.', 'success');
        fetchSnippets();
      }
    } catch {
      triggerToast('Error deleting snippet.', 'error');
    }
  };

  const handleInsertSnippet = (snippet: Snippet) => {
    if (!activeFileId) {
      triggerToast('Open a file first to insert this snippet.', 'info');
      return;
    }
    // Fire event to editor area
    window.dispatchEvent(
      new CustomEvent('codevault-insert-snippet', { detail: { content: snippet.content } })
    );
    triggerToast(`Snippet "${snippet.name}" injected!`, 'success');
  };

  return (
    <div className={`flex flex-col h-full w-full select-none ${
      isLightTheme ? 'bg-slate-50 text-slate-800' : 'bg-[#252526] text-slate-300'
    }`}>
      {/* Header */}
      <div className={`p-3 border-b flex items-center justify-between ${isLightTheme ? 'border-slate-200' : 'border-slate-800'}`}>
        <span className="text-[10px] font-mono tracking-widest uppercase opacity-60">SNIPPET LIBRARY</span>
        <button
          onClick={() => setIsAdding(!isAdding)}
          className={`p-1.5 rounded-md hover:bg-slate-500/10 transition-colors flex items-center gap-1 text-[11px] font-mono ${
            isAdding ? 'text-red-400' : 'text-blue-400'
          }`}
          title="Create New Snippet"
        >
          {isAdding ? 'CANCEL' : <><Plus className="w-3.5 h-3.5" /> SAVE PIECE</>}
        </button>
      </div>

      {isAdding ? (
        <form onSubmit={handleCreateSnippet} className="p-3.5 flex flex-col gap-3 overflow-y-auto flex-grow">
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-wider opacity-60 mb-1">Snippet Name</label>
            <input
              type="text"
              required
              placeholder="e.g., Quick Sort Handler"
              value={name}
              onChange={e => setName(e.target.value)}
              className={`w-full text-xs p-2 rounded border focus:border-blue-500 outline-none font-mono ${
                isLightTheme ? 'bg-white border-slate-300 text-slate-900' : 'bg-[#1e1e1e] border-slate-700 text-slate-100'
              }`}
            />
          </div>

          <div>
            <label className="block text-[10px] font-mono uppercase tracking-wider opacity-60 mb-1">Language Highlight</label>
            <select
              value={language}
              onChange={e => setLanguage(e.target.value)}
              className={`w-full text-xs p-2 rounded border focus:border-blue-500 outline-none font-mono ${
                isLightTheme ? 'bg-white border-slate-300 text-slate-800' : 'bg-[#1e1e1e] border-slate-700 text-slate-300'
              }`}
            >
              {['plaintext', 'javascript', 'typescript', 'python', 'json', 'html', 'css', 'markdown', 'shell', 'robot'].map(lang => (
                <option key={lang} value={lang}>{lang.toUpperCase()}</option>
              ))}
            </select>
          </div>

          <div className="flex-grow flex flex-col">
            <label className="block text-[10px] font-mono uppercase tracking-wider opacity-60 mb-1">Snippet Body</label>
            <textarea
              required
              rows={8}
              placeholder="Paste reusable code lines here..."
              value={content}
              onChange={e => setContent(e.target.value)}
              className={`w-full flex-grow text-xs p-2 rounded border focus:border-blue-500 outline-none font-mono min-h-[140px] resize-none ${
                isLightTheme ? 'bg-white border-slate-300 text-slate-900' : 'bg-[#1e1e1e] border-slate-700 text-slate-100'
              }`}
            />
          </div>

          <button
            type="submit"
            className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-mono tracking-wider font-bold shadow transition-colors"
          >
            SAVE REUSABLE SNIPPET
          </button>
        </form>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Search Box */}
          <div className={`p-2.5 border-b relative flex items-center ${isLightTheme ? 'border-slate-200' : 'border-slate-800'}`}>
            <Search className="w-3.5 h-3.5 absolute left-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search code snippets..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className={`w-full text-xs pl-8 pr-3 py-1.5 rounded outline-none border focus:border-blue-500 ${
                isLightTheme ? 'bg-white border-slate-300 text-slate-800' : 'bg-[#1e1e1e] border-slate-700 text-slate-100'
              }`}
            />
          </div>

          {/* List Wrapper */}
          <div className="flex-grow overflow-y-auto p-2 flex flex-col gap-1.5 scrollbar-thin">
            {loading ? (
              <div className="text-center py-8 text-xs opacity-50 font-mono animate-pulse">Scanning index...</div>
            ) : snippets.length === 0 ? (
              <div className="text-center py-12 text-[10px] font-mono opacity-50 tracking-wide">
                No snippets found. Save your first piece!
              </div>
            ) : (
              snippets.map(snip => (
                <div
                  key={snip._id}
                  onClick={() => handleInsertSnippet(snip)}
                  className={`p-2.5 rounded-md border flex flex-col gap-1 text-left cursor-pointer transition-all hover:border-blue-500/40 relative group ${
                    isLightTheme
                      ? 'bg-white border-slate-200 hover:bg-blue-50/20'
                      : 'bg-[#1e1e1e]/60 border-slate-800 hover:bg-blue-600/5'
                  }`}
                  title="Click once to insert code block into current file cursor position"
                >
                  <div className="flex justify-between items-center pr-6">
                    <span className="font-mono text-xs font-semibold text-slate-200 truncate group-hover:text-amber-400">
                      {snip.name}
                    </span>
                    <span className="text-[9px] font-mono opacity-40 px-1 border border-slate-500/20 rounded">
                      {snip.language}
                    </span>
                  </div>
                  
                  <span className="text-[10px] font-mono opacity-50 line-clamp-2 bg-black/10 p-1.5 rounded pr-4 truncate whitespace-pre overflow-hidden">
                    {snip.content}
                  </span>

                  {/* Quick Delete */}
                  <button
                    onClick={(e) => handleDeleteSnippet(snip._id, e)}
                    className="absolute right-2 top-2 p-1 rounded hover:bg-red-500/10 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Delete Piece"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
