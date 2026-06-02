import React, { useState, useEffect } from 'react';
import { Trash2, RotateCcw, X, Loader2, FolderClosed, File, AlertCircle, RefreshCw } from 'lucide-react';
import { Folder, FileItem } from '../types';

interface TrashBinModalProps {
  onClose: () => void;
  onRefreshWorkspace: () => void;
  isLightTheme: boolean;
}

export default function TrashBinModal({ onClose, onRefreshWorkspace, isLightTheme }: TrashBinModalProps) {
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [deletedFolders, setDeletedFolders] = useState<Folder[]>([]);
  const [deletedFiles, setDeletedFiles] = useState<FileItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTrash();
  }, []);

  const fetchTrash = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/fs/trash');
      const data = await response.json();
      if (response.ok) {
        setDeletedFolders(data.folders || []);
        setDeletedFiles(data.files || []);
      } else {
        setError(data.error || 'Failed to list trash items.');
      }
    } catch (err) {
      setError('Could not connect to trash manager.');
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (type: 'file' | 'folder', id: string) => {
    setActionLoading(id);
    setError(null);
    try {
      const response = await fetch(`/api/fs/restore/${type}/${id}`, {
        method: 'POST',
      });
      const data = await response.json();
      if (response.ok && data.success) {
        await fetchTrash();
        onRefreshWorkspace();
      } else {
        setError(data.error || 'Restore operation aborted.');
      }
    } catch (err) {
      setError('Connection failed during restoration.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleEmptyTrash = async () => {
    if (!window.confirm('Are you absolutely sure you want to permanently erase ALL trash? This cannot be undone.')) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/fs/trash/empty', {
        method: 'POST',
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setDeletedFolders([]);
        setDeletedFiles([]);
        onRefreshWorkspace();
      } else {
        setError(data.error || 'Failed to purge recycle bin.');
      }
    } catch (err) {
      setError('Unable to issue request to erase recycle bin.');
    } finally {
      setLoading(false);
    }
  };

  const hasBinItems = deletedFolders.length > 0 || deletedFiles.length > 0;

  return (
    <div id="trash-bin-modal-overlay" className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div
        className={`w-full max-w-2xl rounded-xl p-6 border shadow-2xl transition-all ${
          isLightTheme ? 'bg-white border-slate-200 text-slate-800' : 'bg-[#252526] border-slate-700/60 text-slate-100'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b pb-3 mb-4 border-slate-500/10">
          <div className="flex items-center space-x-2 text-red-500">
            <Trash2 className="w-5 h-5" />
            <h2 className="text-sm font-semibold tracking-wide uppercase font-mono">CodeVault Recycle Bin</h2>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={fetchTrash}
              className="p-1 rounded-md hover:bg-slate-500/10 text-slate-400 hover:text-slate-200 transition-colors"
              title="Refresh Trash Bin"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded-md hover:bg-slate-500/10 text-slate-400 hover:text-slate-200 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/15 border border-red-500/20 text-xs text-red-400 rounded-lg flex items-center space-x-2 font-mono">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Content Box */}
        <div className={`min-h-[250px] max-h-[400px] overflow-y-auto rounded-lg border p-4 ${
          isLightTheme ? 'bg-slate-50 border-slate-200' : 'bg-black/20 border-slate-800'
        }`}>
          {loading && (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 space-y-2 font-mono text-xs">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
              <span>Scanning recycle records...</span>
            </div>
          )}

          {!loading && !hasBinItems && (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
              <RotateCcw className="w-8 h-8 text-slate-500/60" />
              <p className="text-xs font-mono text-slate-400">Recycle bin is empty. No soft-deleted items found.</p>
            </div>
          )}

          {!loading && hasBinItems && (
            <div className="space-y-4">
              {/* Deleted Folders Section */}
              {deletedFolders.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-[10px] font-mono tracking-widest uppercase text-slate-400 font-bold border-b pb-1 border-slate-500/10">
                    Folders ({deletedFolders.length})
                  </h3>
                  {deletedFolders.map(f => (
                    <div
                      key={f._id}
                      className={`flex justify-between items-center p-2 rounded-md ${
                        isLightTheme ? 'hover:bg-slate-100 bg-white shadow-sm' : 'hover:bg-slate-800 bg-[#1e1e1e]/60'
                      }`}
                    >
                      <div className="flex items-center space-x-2 truncate">
                        <FolderClosed className="w-4 h-4 text-amber-500 flex-shrink-0" />
                        <span className="text-xs truncate font-mono">{f.name}</span>
                      </div>
                      <button
                        id={`restore-folder-${f._id}`}
                        onClick={() => handleRestore('folder', f._id)}
                        disabled={actionLoading !== null}
                        className="flex items-center space-x-1 px-2.5 py-1 text-[10px] hover:text-white bg-blue-600/10 hover:bg-blue-600 text-blue-400 rounded transition-all font-mono"
                      >
                        {actionLoading === f._id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <>
                            <RotateCcw className="w-3 h-3" />
                            <span>Restore</span>
                          </>
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Deleted Files Section */}
              {deletedFiles.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-[10px] font-mono tracking-widest uppercase text-slate-400 font-bold border-b pb-1 border-slate-500/10">
                    Files ({deletedFiles.length})
                  </h3>
                  {deletedFiles.map(f => (
                    <div
                      key={f._id}
                      className={`flex justify-between items-center p-2 rounded-md ${
                        isLightTheme ? 'hover:bg-slate-100 bg-white shadow-sm' : 'hover:bg-slate-800 bg-[#1e1e1e]/60'
                      }`}
                    >
                      <div className="flex flex-col truncate pr-4">
                        <div className="flex items-center space-x-2">
                          <File className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                          <span className="text-xs truncate font-semibold font-mono">{f.name}</span>
                        </div>
                        <span className="text-[9px] text-slate-500 truncate mt-0.5 ml-6">
                          Path: {f.path}
                        </span>
                      </div>
                      <button
                        id={`restore-file-${f._id}`}
                        onClick={() => handleRestore('file', f._id)}
                        disabled={actionLoading !== null}
                        className="flex items-center space-x-1 px-2.5 py-1 text-[10px] hover:text-white bg-blue-600/10 hover:bg-blue-600 text-blue-400 rounded transition-all font-mono"
                      >
                        {actionLoading === f._id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <>
                            <RotateCcw className="w-3 h-3" />
                            <span>Restore</span>
                          </>
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="mt-5 flex justify-between space-x-3">
          <button
            id="empty-trash-btn"
            onClick={handleEmptyTrash}
            disabled={loading || !hasBinItems}
            className="flex items-center space-x-1.5 px-3 py-2 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white rounded-lg text-xs font-semibold uppercase tracking-wider transition-all disabled:opacity-30 disabled:hover:bg-red-600"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Safely Purge Bin</span>
          </button>
          <button
            id="close-trash-btn"
            onClick={onClose}
            className={`px-4 py-2 border rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors ${
              isLightTheme ? 'hover:bg-slate-100 border-slate-300' : 'hover:bg-slate-800 border-slate-755'
            }`}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
