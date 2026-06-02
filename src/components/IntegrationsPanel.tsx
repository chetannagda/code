import React, { useState } from 'react';
import { Github, Download, Import, Loader2, Sparkles, CheckCircle } from 'lucide-react';

interface IntegrationsPanelProps {
  isLightTheme: boolean;
  onRefreshWorkspace: () => void;
  triggerToast: (text: string, type: 'success' | 'info' | 'error') => void;
}

export default function IntegrationsPanel({
  isLightTheme,
  onRefreshWorkspace,
  triggerToast,
}: IntegrationsPanelProps) {
  const [gistUrl, setGistUrl] = useState('');
  const [importingGist, setImportingGist] = useState(false);
  const [repoUrl, setRepoUrl] = useState('');
  const [importingRepo, setImportingRepo] = useState(false);
  const [downloadingZip, setDownloadingZip] = useState(false);

  const handleImportRepo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoUrl.trim()) {
      triggerToast('GitHub Repository URL is required.', 'info');
      return;
    }

    setImportingRepo(true);
    try {
      const res = await fetch('/api/github/import-repo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: repoUrl }),
      });
      const data = await res.json();
      if (res.ok) {
        triggerToast(data.message || 'GitHub Repository successfully extracted and imported!', 'success');
        setRepoUrl('');
        onRefreshWorkspace();
      } else {
        triggerToast(data.error || 'Failed to extract Repository.', 'error');
      }
    } catch {
      triggerToast('Network error during GitHub API connection.', 'error');
    } finally {
      setImportingRepo(false);
    }
  };

  const handleImportGist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gistUrl.trim()) {
      triggerToast('Gist URL or Gist ID is required.', 'info');
      return;
    }

    setImportingGist(true);
    try {
      const res = await fetch('/api/gist/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: gistUrl }),
      });
      const data = await res.json();
      if (res.ok) {
        triggerToast(data.message || 'Gist imported!', 'success');
        setGistUrl('');
        onRefreshWorkspace();
      } else {
        triggerToast(data.error || 'Gist import failed', 'error');
      }
    } catch (err: any) {
      triggerToast('Network error during Gist fetch.', 'error');
    } finally {
      setImportingGist(false);
    }
  };

  const handleDownloadWorkspaceZip = async () => {
    setDownloadingZip(true);
    try {
      // Direct stream download via anchor tag with credentials
      const link = document.createElement('a');
      link.href = '/api/fs/export/zip';
      link.setAttribute('download', 'codevault-workspace.zip');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      triggerToast('ZIP file stream started!', 'success');
    } catch {
      triggerToast('Failed to download workspace.', 'error');
    } finally {
      setTimeout(() => setDownloadingZip(false), 2000);
    }
  };

  return (
    <div className={`flex flex-col h-full w-full select-none ${
      isLightTheme ? 'bg-slate-50 text-slate-800' : 'bg-[#252526] text-slate-300'
    }`}>
      {/* Header */}
      <div className={`p-3 border-b flex items-center justify-between ${isLightTheme ? 'border-slate-200' : 'border-slate-800'}`}>
        <span className="text-[10px] font-mono tracking-widest uppercase opacity-60">PORTABILITY METRICS</span>
        <Github className="w-4 h-4 text-slate-400" />
      </div>

      <div className="p-4 flex flex-col gap-5 overflow-y-auto flex-grow justify-start">
        {/* Export Section */}
        <div className={`p-3 rounded-lg border ${isLightTheme ? 'bg-white border-slate-200' : 'bg-[#1e1e1e]/50 border-slate-800'}`}>
          <div className="flex items-center gap-2 mb-2">
            <Download className="w-4 h-4 text-blue-400" />
            <h4 className="text-xs font-semibold font-mono uppercase tracking-wider text-slate-200 group-hover:text-amber-400">Export All</h4>
          </div>
          <p className="text-[11px] opacity-65 mb-3 font-sans leading-relaxed">
            Download your entire un-deleted file/folder collection inside a beautiful structured ZIP bundle.
          </p>
          <button
            onClick={handleDownloadWorkspaceZip}
            disabled={downloadingZip}
            className={`w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-mono tracking-wider font-bold shadow flex items-center justify-center gap-2 transition-colors ${
              downloadingZip ? 'opacity-60 cursor-not-allowed' : ''
            }`}
          >
            {downloadingZip ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                STREAMING ZIP...
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                DOWNLOAD EXPORT ZIP
              </>
            )}
          </button>
        </div>

        {/* GitHub Gist Section */}
        <div className={`p-3 rounded-lg border ${isLightTheme ? 'bg-white border-slate-200' : 'bg-[#1e1e1e]/50 border-slate-800'}`}>
          <div className="flex items-center gap-2 mb-2">
            <Import className="w-4 h-4 text-emerald-400" />
            <h4 className="text-xs font-semibold font-mono uppercase tracking-wider text-slate-200">GitHub Gist Import</h4>
          </div>
          <p className="text-[11px] opacity-65 mb-3 font-sans leading-relaxed">
            Paste any public GitHub Gist URL / ID. All files inside the Gist will instantly populate in your root filesystem workspace.
          </p>
          <form onSubmit={handleImportGist} className="flex flex-col gap-2">
            <input
              type="text"
              required
              placeholder="e.g., https://gist.github.com/..."
              value={gistUrl}
              onChange={e => setGistUrl(e.target.value)}
              className={`w-full text-xs p-2 rounded border focus:border-blue-500 outline-none font-mono ${
                isLightTheme ? 'bg-white border-slate-300 text-slate-900' : 'bg-[#1e1e1e] border-slate-700 text-slate-100'
              }`}
            />
            <button
              type="submit"
              disabled={importingGist || !gistUrl}
              className={`w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-mono tracking-wider font-bold shadow flex items-center justify-center gap-1.5 transition-colors ${
                importingGist ? 'opacity-60 cursor-not-allowed' : ''
              }`}
            >
              {importingGist ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  IMPORTING FILES...
                </>
              ) : (
                <>
                  <Import className="w-3.5 h-3.5" />
                  IMPORT GIST ARCHIVE
                </>
              )}
            </button>
          </form>
        </div>

        {/* GitHub Repository Importer */}
        <div className={`p-3 rounded-lg border ${isLightTheme ? 'bg-white border-slate-200' : 'bg-[#1e1e1e]/50 border-slate-800'}`}>
          <div className="flex items-center gap-2 mb-2">
            <Github className="w-4 h-4 text-sky-400" />
            <h4 className="text-xs font-semibold font-mono uppercase tracking-wider text-slate-200">GitHub Repo Extractor</h4>
          </div>
          <p className="text-[11px] opacity-65 mb-3 font-sans leading-relaxed">
            Paste a public GitHub Repo URL. CodeVault recursively clones directories, matches code extensions, and populates your workspace folder list.
          </p>
          <form onSubmit={handleImportRepo} className="flex flex-col gap-2">
            <input
              type="text"
              required
              placeholder="e.g., https://github.com/owner/repo"
              value={repoUrl}
              onChange={e => setRepoUrl(e.target.value)}
              className={`w-full text-xs p-2 rounded border focus:border-blue-500 outline-none font-mono ${
                isLightTheme ? 'bg-white border-slate-300 text-slate-900' : 'bg-[#1e1e1e] border-slate-700 text-slate-100'
              }`}
            />
            <button
              type="submit"
              disabled={importingRepo || !repoUrl}
              className={`w-full py-2 bg-sky-600 hover:bg-sky-500 text-white rounded text-xs font-mono tracking-wider font-bold shadow flex items-center justify-center gap-1.5 transition-colors ${
                importingRepo ? 'opacity-60 cursor-not-allowed' : ''
              }`}
            >
              {importingRepo ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  EXTRACTING FILES...
                </>
              ) : (
                <>
                  <Github className="w-3.5 h-3.5" />
                  PULL REPO WORKSPACE
                </>
              )}
            </button>
          </form>
        </div>

        {/* Local Download formatting hint */}
        <div className="p-3 bg-blue-500/5 rounded-lg border border-blue-500/10 text-[10.5px] font-sans opacity-70 leading-relaxed">
          <span className="font-semibold block mb-0.5 text-blue-400">💡 Native Downloads Tip</span>
          To download any opened single file in its authentic file extension or standard text (.txt) file format, click the Download Options icon at the top right header inside the central code editor pane.
        </div>
      </div>
    </div>
  );
}
