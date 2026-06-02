import React, { useState } from 'react';
import { Search, Loader2, FileCode, CheckCircle2, AlertCircle } from 'lucide-react';
import { SearchResult } from '../types';

interface SearchPanelProps {
  onSelectResult: (fileId: string, lineNumber: number) => void;
  isLightTheme: boolean;
}

export default function SearchPanel({ onSelectResult, isLightTheme }: SearchPanelProps) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const data = await response.json();
      if (response.ok) {
        setResults(data.results || []);
      } else {
        setError(data.error || 'Search service encountered an issue.');
      }
    } catch (err) {
      setError('Failed to reach global search service.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="search-panel-container" className="flex flex-col h-full select-none font-sans">
      {/* Title */}
      <div className={`p-4 border-b flex items-center justify-between ${isLightTheme ? 'border-slate-200' : 'border-slate-800'}`}>
        <h2 className="text-xs font-mono uppercase tracking-widest font-semibold flex items-center space-x-2">
          <Search className="w-3.5 h-3.5 text-blue-500" />
          <span>Search in Workspace</span>
        </h2>
      </div>

      {/* Input */}
      <form onSubmit={handleSearch} className="p-3 border-b flex flex-col gap-2 relative">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            id="search-panel-query-input"
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search filenames or content..."
            className={`w-full pl-9 pr-8 py-2 text-xs rounded-md border outline-none font-sans focus:border-blue-500 ${
              isLightTheme
                ? 'bg-slate-50 border-slate-300 text-slate-800'
                : 'bg-[#1e1e1e] border-slate-700 text-slate-200'
            }`}
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setResults(null);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 text-sm"
            >
              ×
            </button>
          )}
        </div>
        <button
          id="search-panel-search-btn"
          type="submit"
          disabled={loading}
          className="w-full py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs transition-colors flex items-center justify-center space-x-1"
        >
          {loading ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <>
              <span>Search codebase</span>
            </>
          )}
        </button>
      </form>

      {/* Search results */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {loading && (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400 font-mono text-[11px] space-y-2">
            <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
            <span>Scanning indexing indices...</span>
          </div>
        )}

        {error && (
          <div className="p-3 my-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-md flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span className="font-mono">{error}</span>
          </div>
        )}

        {results !== null && !loading && results.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400 font-mono text-[11px]">
            <span>No matching matches found.</span>
          </div>
        )}

        {results !== null && results.length > 0 && !loading && (
          <div className="space-y-2">
            <p className="text-[10px] font-mono opacity-60 px-1 py-1">
              Found {results.length} result(s)
            </p>
            {results.map((r, idx) => (
              <div
                key={`${r.fileId}-${r.lineNumber}-${idx}`}
                onClick={() => onSelectResult(r.fileId, r.lineNumber)}
                className={`p-2.5 rounded-lg border text-left cursor-pointer transition-all ${
                  isLightTheme
                    ? 'bg-white border-slate-200 hover:bg-slate-50'
                    : 'bg-[#1e1e1e]/60 border-slate-800 hover:bg-[#2d2d2d] focus:bg-[#333]'
                }`}
              >
                <div className="flex items-center space-x-2 mb-1.5">
                  <FileCode className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                  <span className={`text-xs font-semibold truncate ${isLightTheme ? 'text-slate-800' : 'text-slate-200'}`}>
                    {r.fileName}
                  </span>
                </div>
                <div className="text-[10px] font-mono text-slate-400 mb-2 truncate">
                  Path: {r.path}
                </div>
                {/* Preview Match Block */}
                <div className={`p-1.5 rounded text-[11px] font-mono overflow-x-auto whitespace-pre-wrap select-text truncate ${
                  isLightTheme ? 'bg-slate-100 text-slate-700' : 'bg-black/30 text-emerald-400 border border-slate-800/40'
                }`}>
                  <span className="text-[10px] text-zinc-500 mr-2 select-none border-r pr-1.5 py-0.5 border-slate-700/50">
                    Line {r.lineNumber}
                  </span>
                  <span>{r.lineText}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
