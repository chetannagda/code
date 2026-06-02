import React, { useState, useRef, useEffect } from 'react';
import {
  Folder,
  FolderOpen,
  File,
  FileCode,
  Plus,
  FolderPlus,
  MoreVertical,
  Clipboard,
  Trash2,
  Upload,
  ChevronDown,
  ChevronRight,
  FolderClosed,
  Loader2,
  Trash,
  Info,
  AlertCircle
} from 'lucide-react';
import { Folder as FolderType, FileItem } from '../types';

interface SidebarProps {
  folders: FolderType[];
  files: FileItem[];
  activeFileId: string | null;
  onSelectFile: (fileId: string) => void;
  onCreateFile: (name: string, folderId: string | null) => Promise<any>;
  onCreateFolder: (name: string, parentId: string | null) => Promise<any>;
  onRenameFile: (id: string, newName: string) => Promise<any>;
  onRenameFolder: (id: string, newName: string) => Promise<any>;
  onDeleteFile: (id: string) => Promise<any>;
  onDeleteFolder: (id: string) => Promise<any>;
  onMoveFile: (fileId: string, targetFolderId: string | null) => Promise<any>;
  onMoveFolder: (folderId: string, targetParentId: string | null) => Promise<any>;
  onCopyFile: (fileId: string) => void;
  onPasteFile: (targetFolderId: string | null) => void;
  copiedFileId: string | null;
  onOpenTrashBin: () => void;
  isLightTheme: boolean;
  onRefreshWorkspace: () => void;
}

export default function Sidebar({
  folders,
  files,
  activeFileId,
  onSelectFile,
  onCreateFile,
  onCreateFolder,
  onRenameFile,
  onRenameFolder,
  onDeleteFile,
  onDeleteFolder,
  onMoveFile,
  onMoveFolder,
  onCopyFile,
  onPasteFile,
  copiedFileId,
  onOpenTrashBin,
  isLightTheme,
  onRefreshWorkspace,
}: SidebarProps) {
  // Sidebar states
  const [expandedFolderIds, setExpandedFolderIds] = useState<Record<string, boolean>>({});
  const [zipUploading, setZipUploading] = useState(false);
  const [zipMessage, setZipMessage] = useState<string | null>(null);

  // Language filter & Recent files states
  const [selectedLanguage, setSelectedLanguage] = useState<string>('all');
  const [recentFileIds, setRecentFileIds] = useState<string[]>([]);
  const [showRecents, setShowRecents] = useState<boolean>(true);

  // Rename states
  const [renamingItemId, setRenamingItemId] = useState<string | null>(null);
  const [renamingItemType, setRenamingItemType] = useState<'file' | 'folder' | null>(null);
  const [renamingValue, setRenamingValue] = useState('');

  // Create new folder/file item inline state
  const [creatingInFolderId, setCreatingInFolderId] = useState<string | null>(null);
  const [creatingType, setCreatingType] = useState<'file' | 'folder' | null>(null);
  const [creatingValue, setCreatingValue] = useState('');

  // Context menu states
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    itemId: string | null;
    itemType: 'file' | 'folder' | 'root' | null;
  } | null>(null);

  const [deleteConfirm, setDeleteConfirm] = useState<{
    id: string;
    name: string;
    type: 'file' | 'folder';
  } | null>(null);

  const contextMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Close context menu on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        setContextMenu(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Track active file mutations to insert into recent files
  useEffect(() => {
    if (activeFileId) {
      setRecentFileIds(prev => {
        const filtered = prev.filter(id => id !== activeFileId);
        const updated = [activeFileId, ...filtered].slice(0, 10);
        localStorage.setItem('codevault-recent-files', JSON.stringify(updated));
        return updated;
      });
    }
  }, [activeFileId]);

  // Read back recent files payload on start
  useEffect(() => {
    const raw = localStorage.getItem('codevault-recent-files');
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setRecentFileIds(parsed);
        }
      } catch {
        // ignore
      }
    }
  }, []);

  // Filter out files that don't exist in active schema currently
  const actualRecentFiles = recentFileIds
    .map(id => files.find(f => f._id === id))
    .filter((f): f is FileItem => !!f && !f.isDeleted);

  // Helper: does a directory contain any files of current active language filter
  const folderHasMatchingContent = (folderId: string): boolean => {
    const matchingFile = files.some(
      f =>
        f.folderId === folderId &&
        !f.isDeleted &&
        (selectedLanguage === 'all' || f.language.toLowerCase() === selectedLanguage.toLowerCase())
    );
    if (matchingFile) return true;

    const subFolders = folders.filter(fol => fol.parentId === folderId && !fol.isDeleted);
    return subFolders.some(sf => folderHasMatchingContent(sf._id));
  };

  const handleToggleFolder = (folderId: string) => {
    setExpandedFolderIds(prev => ({
      ...prev,
      [folderId]: !prev[folderId],
    }));
  };

  // ZIP / folders upload handling
  const handleZipUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setZipUploading(true);
    setZipMessage('Unpacking and converting zip...');

    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        const base64String = (reader.result as string).split(',')[1];
        try {
          const res = await fetch('/api/fs/zip', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              zipBase64: base64String,
              parentFolderId: contextMenu?.itemType === 'folder' ? contextMenu.itemId : null,
            }),
          });
          const result = await res.json();
          if (res.ok) {
            setZipMessage('Workspace updated successfully.');
            onRefreshWorkspace();
          } else {
            setZipMessage(result.error || 'Failed to extract package.');
          }
        } catch {
          setZipMessage('Communication lost during unpack upload.');
        } finally {
          setTimeout(() => {
            setZipMessage(null);
            setZipUploading(false);
          }, 3500);
        }
      };
    } catch {
      setZipUploading(false);
      setZipMessage('Unable to resolve binary package.');
    }
  };

  // Drag and drop mechanics
  const handleDragStart = (e: React.DragEvent, id: string, type: 'file' | 'folder') => {
    e.dataTransfer.setData('application/codevault-id', id);
    e.dataTransfer.setData('application/codevault-type', type);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDropItem = async (e: React.DragEvent, targetFolderId: string | null) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('application/codevault-id');
    const draggedType = e.dataTransfer.getData('application/codevault-type');

    if (!draggedId || draggedId === targetFolderId) return;

    if (draggedType === 'file') {
      await onMoveFile(draggedId, targetFolderId);
    } else if (draggedType === 'folder') {
      // Prevent cyclic loops
      let checkId = targetFolderId;
      let cyclic = false;
      while (checkId) {
        if (checkId === draggedId) {
          cyclic = true;
          break;
        }
        const parent = folders.find(f => f._id === checkId);
        checkId = parent ? parent.parentId : null;
      }
      if (!cyclic) {
        await onMoveFolder(draggedId, targetFolderId);
      }
    }
  };

  // Context Menu Helpers
  const handleContextMenuTrigger = (e: React.MouseEvent, itemId: string | null, itemType: 'file' | 'folder' | 'root') => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      itemId,
      itemType,
    });
  };

  const executeRename = async () => {
    if (!renamingValue.trim() || !renamingItemId) return;

    if (renamingItemType === 'file') {
      await onRenameFile(renamingItemId, renamingValue);
    } else if (renamingItemType === 'folder') {
      await onRenameFolder(renamingItemId, renamingValue);
    }

    setRenamingItemId(null);
    setRenamingItemType(null);
    setRenamingValue('');
  };

  const executeCreateInline = async () => {
    if (!creatingValue.trim()) {
      setCreatingInFolderId(null);
      setCreatingType(null);
      return;
    }

    if (creatingType === 'file') {
      await onCreateFile(creatingValue, creatingInFolderId);
    } else if (creatingType === 'folder') {
      await onCreateFolder(creatingValue, creatingInFolderId);
    }

    setCreatingInFolderId(null);
    setCreatingType(null);
    setCreatingValue('');
  };

  // File type categorizer
  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    let badgeText = '';
    let badgeColor = '';
    let iconColor = 'text-slate-400';

    if (['py'].includes(ext || '')) {
      badgeText = 'PY';
      badgeColor = 'bg-emerald-500 text-slate-950 font-black';
      iconColor = 'text-emerald-400';
    } else if (['js', 'jsx'].includes(ext || '')) {
      badgeText = 'JS';
      badgeColor = 'bg-yellow-500 text-slate-950 font-black';
      iconColor = 'text-yellow-400';
    } else if (['ts', 'tsx'].includes(ext || '')) {
      badgeText = 'TS';
      badgeColor = 'bg-blue-600 text-white font-extrabold';
      iconColor = 'text-blue-400';
    } else if (['json'].includes(ext || '')) {
      badgeText = 'JSON';
      badgeColor = 'bg-amber-500 text-slate-950 font-bold';
      iconColor = 'text-amber-400';
    } else if (['html'].includes(ext || '')) {
      badgeText = 'HTML';
      badgeColor = 'bg-orange-500 text-white font-extrabold';
      iconColor = 'text-orange-400';
    } else if (['css'].includes(ext || '')) {
      badgeText = 'CSS';
      badgeColor = 'bg-teal-500 text-white font-extrabold';
      iconColor = 'text-teal-400';
    } else if (['md', 'markdown'].includes(ext || '')) {
      badgeText = 'MD';
      badgeColor = 'bg-indigo-600 text-white font-black';
      iconColor = 'text-indigo-400';
    } else if (['sh', 'bash'].includes(ext || '')) {
      badgeText = 'SH';
      badgeColor = 'bg-slate-700 text-slate-200 font-mono';
      iconColor = 'text-slate-400';
    }

    return (
      <span className="flex items-center space-x-1 flex-shrink-0">
        {badgeText ? (
          <span className={`text-[7.5px] font-mono leading-none tracking-tighter px-1 py-0.5 rounded ${badgeColor}`}>
            {badgeText}
          </span>
        ) : (
          <File className="w-3.5 h-3.5 text-slate-400" />
        )}
      </span>
    );
  };

  // Recursive Tree Node renderer
  const renderTreeNodes = (parentId: string | null, depth: number) => {
    const rawFolders = folders.filter(f => f.parentId === parentId && !f.isDeleted);
    const rawFiles = files.filter(f => f.folderId === parentId && !f.isDeleted);

    // If a language filter is active, only show directories containing matching files OR file items matching
    const currentFolders = selectedLanguage === 'all'
      ? rawFolders
      : rawFolders.filter(folder => folderHasMatchingContent(folder._id));

    const currentFiles = selectedLanguage === 'all'
      ? rawFiles
      : rawFiles.filter(file => file.language.toLowerCase() === selectedLanguage.toLowerCase());

    return (
      <div className="flex flex-col space-y-0.5">
        {/* Folders */}
        {currentFolders.map(folder => {
          const isExpanded = expandedFolderIds[folder._id];
          const isRenaming = renamingItemId === folder._id && renamingItemType === 'folder';

          return (
            <div
              key={folder._id}
              className="flex flex-col select-none"
              onDragOver={handleDragOver}
              onDrop={e => handleDropItem(e, folder._id)}
            >
              {/* Folder Line Row */}
              <div
                draggable="true"
                onDragStart={e => handleDragStart(e, folder._id, 'folder')}
                onContextMenu={e => handleContextMenuTrigger(e, folder._id, 'folder')}
                onClick={() => handleToggleFolder(folder._id)}
                style={{ paddingLeft: `${depth * 14 + 6}px` }}
                className={`flex items-center justify-between py-1.5 px-2 hover:bg-slate-500/10 cursor-pointer rounded transition-all group ${
                  isLightTheme ? 'hover:bg-slate-100 text-slate-700' : 'hover:bg-[#2d2d2d] text-slate-300'
                }`}
              >
                <div className="flex items-center space-x-2 truncate">
                  {isExpanded ? (
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  )}
                  {isExpanded ? (
                    <FolderOpen className="w-4 h-4 text-yellow-500 flex-shrink-0" />
                  ) : (
                    <FolderClosed className="w-4 h-4 text-yellow-500 flex-shrink-0" />
                  )}

                  {isRenaming ? (
                    <input
                      type="text"
                      value={renamingValue}
                      autoFocus
                      onChange={e => setRenamingValue(e.target.value)}
                      onClick={e => e.stopPropagation()}
                      onBlur={executeRename}
                      onKeyDown={e => e.key === 'Enter' && executeRename()}
                      className={`text-xs px-1 py-0.5 rounded outline-none border focus:border-blue-500 ${
                        isLightTheme ? 'bg-white border-slate-300 text-slate-800' : 'bg-[#1e1e1e] border-slate-700 text-slate-100'
                      }`}
                    />
                  ) : (
                    <span className="text-xs truncate font-mono">{folder.name}</span>
                  )}
                </div>

                <div className="opacity-0 group-hover:opacity-100 flex items-center space-x-1.5 select-none stop-propagation">
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      setCreatingInFolderId(folder._id);
                      setCreatingType('file');
                      setExpandedFolderIds(prev => ({ ...prev, [folder._id]: true }));
                    }}
                    title="New File Inside"
                    className="p-0.5 rounded hover:bg-slate-500/20 text-slate-400 hover:text-slate-200"
                  >
                    <Plus className="w-3" />
                  </button>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      setDeleteConfirm({ id: folder._id, name: folder.name, type: 'folder' });
                    }}
                    title="Delete Folder"
                    className="p-0.5 rounded hover:bg-red-500/15 text-slate-400 hover:text-red-400"
                  >
                    <Trash className="w-3 h-3" />
                  </button>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      setContextMenu({ x: e.clientX, y: e.clientY, itemId: folder._id, itemType: 'folder' });
                    }}
                    className="p-0.5 rounded hover:bg-slate-500/20 text-slate-400 hover:text-slate-200"
                  >
                    <MoreVertical className="w-3" />
                  </button>
                </div>
              </div>

              {/* Expand Node child folders/files */}
              {isExpanded && (
                <div className="flex flex-col border-l border-slate-500/10 ml-[10px]">
                  {/* Inline creation handler */}
                  {creatingInFolderId === folder._id && creatingType && (
                    <div style={{ paddingLeft: `${(depth + 1) * 14 + 6}px` }} className="flex items-center space-x-2 py-1 px-2">
                      {creatingType === 'file' ? <File className="w-3.5 h-3.5 text-slate-400 animate-pulse" /> : <FolderTypeIcon animate className="w-3.5 h-3.5 text-yellow-500" />}
                      <input
                        type="text"
                        autoFocus
                        placeholder={creatingType === 'file' ? 'new_file.py' : 'New Folder'}
                        value={creatingValue}
                        onChange={e => setCreatingValue(e.target.value)}
                        onBlur={executeCreateInline}
                        onKeyDown={e => e.key === 'Enter' && executeCreateInline()}
                        className={`text-[11px] font-mono px-1 py-0.5 rounded outline-none border focus:border-blue-500 w-full ${
                          isLightTheme ? 'bg-white border-slate-300 text-slate-800' : 'bg-[#1e1e1e] border-slate-700 text-slate-100'
                        }`}
                      />
                    </div>
                  )}
                  {renderTreeNodes(folder._id, depth + 1)}
                </div>
              )}
            </div>
          );
        })}

        {/* Files */}
        {currentFiles.map(file => {
          const isSelected = activeFileId === file._id;
          const isRenaming = renamingItemId === file._id && renamingItemType === 'file';

          return (
            <div
              key={file._id}
              draggable="true"
              onDragStart={e => handleDragStart(e, file._id, 'file')}
              onContextMenu={e => handleContextMenuTrigger(e, file._id, 'file')}
              onClick={() => onSelectFile(file._id)}
              style={{ paddingLeft: `${depth * 14 + 18}px` }}
              className={`flex items-center justify-between py-1 px-2 hover:bg-slate-500/10 cursor-pointer rounded group transition-all ${
                isSelected
                  ? isLightTheme
                    ? 'bg-blue-100 text-blue-700 font-medium'
                    : 'bg-blue-600/15 text-blue-300 border-l-2 border-blue-500 font-medium'
                  : isLightTheme
                    ? 'text-slate-600 hover:bg-slate-50'
                    : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center space-x-2 truncate">
                {getFileIcon(file.name)}
                {isRenaming ? (
                  <input
                    type="text"
                    value={renamingValue}
                    autoFocus
                    onChange={e => setRenamingValue(e.target.value)}
                    onClick={e => e.stopPropagation()}
                    onBlur={executeRename}
                    onKeyDown={e => e.key === 'Enter' && executeRename()}
                    className={`text-xs px-1 py-0.5 rounded outline-none border focus:border-blue-500 ${
                      isLightTheme ? 'bg-white border-slate-300 text-slate-811' : 'bg-[#1e1e1e] border-slate-705 text-slate-100'
                    }`}
                  />
                ) : (
                  <span className="text-xs truncate font-mono">{file.name}</span>
                )}
              </div>

              <div className="opacity-0 group-hover:opacity-100 flex items-center space-x-1 select-none stop-propagation">
                <button
                  onClick={e => {
                    e.stopPropagation();
                    setDeleteConfirm({ id: file._id, name: file.name, type: 'file' });
                  }}
                  title="Delete File"
                  className="p-0.5 rounded hover:bg-red-500/15 text-slate-400 hover:text-red-400"
                >
                  <Trash className="w-3 h-3" />
                </button>
                <button
                  onClick={e => {
                    e.stopPropagation();
                    setContextMenu({ x: e.clientX, y: e.clientY, itemId: file._id, itemType: 'file' });
                  }}
                  className="p-0.5 rounded hover:bg-slate-500/20 text-slate-400 hover:text-slate-200 select-none stop-propagation"
                >
                  <MoreVertical className="w-3 h-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // Quick Folder item helper
  const FolderTypeIcon = ({ animate, className }: { animate?: boolean; className?: string }) => {
    return <FolderClosed className={`${className} ${animate ? 'animate-pulse' : ''}`} />;
  };

  return (
    <div
      id="codevault-workspace-sidebar"
      className={`flex flex-col h-full w-full border-r relative select-none font-sans ${
        isLightTheme ? 'bg-slate-50 border-slate-200 text-slate-800' : 'bg-[#252526] border-slate-800 text-slate-300'
      }`}
      onContextMenu={e => handleContextMenuTrigger(e, null, 'root')}
      onDragOver={handleDragOver}
      onDrop={e => handleDropItem(e, null)}
    >
      {/* Search and Action Bar */}
      <div className={`p-3 border-b flex items-center justify-between ${isLightTheme ? 'border-slate-200' : 'border-slate-800'}`}>
        <span className="text-[10px] font-mono tracking-widest uppercase opacity-60">WORKSPACE FILES</span>
        <div className="flex items-center space-x-1.5">
          <button
            onClick={() => {
              setCreatingInFolderId(null);
              setCreatingType('file');
            }}
            title="New File in Root"
            className={`p-1.5 rounded-md hover:bg-slate-500/10 transition-colors ${isLightTheme ? 'text-slate-600' : 'text-slate-300'}`}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              setCreatingInFolderId(null);
              setCreatingType('folder');
            }}
            title="New Folder in Root"
            className={`p-1.5 rounded-md hover:bg-slate-500/10 transition-colors ${isLightTheme ? 'text-slate-600' : 'text-slate-300'}`}
          >
            <FolderPlus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            title="Upload Project ZIP"
            className={`p-1.5 rounded-md hover:bg-slate-500/10 transition-colors ${isLightTheme ? 'text-slate-600' : 'text-slate-300'}`}
          >
            <Upload className="w-3.5 h-3.5" />
          </button>
          <input
            id="hidden-zip-upload-input"
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept=".zip"
            onChange={handleZipUpload}
          />
        </div>
      </div>

      {/* Language Filter select item */}
      <div className={`px-3 py-1.5 border-b flex items-center justify-between gap-2 text-xs ${
        isLightTheme ? 'bg-slate-100/50 border-slate-205' : 'bg-[#1e1e1f] border-slate-800'
      }`}>
        <span className="text-[9px] font-mono uppercase tracking-widest opacity-60">Lang:</span>
        <select
          value={selectedLanguage}
          onChange={e => {
            const lang = e.target.value;
            setSelectedLanguage(lang);
            if (lang !== 'all') {
              const toExpand: Record<string, boolean> = {};
              folders.forEach(fol => {
                if (folderHasMatchingContent(fol._id)) {
                  toExpand[fol._id] = true;
                }
              });
              setExpandedFolderIds(prev => ({ ...prev, ...toExpand }));
            }
          }}
          className={`px-1.5 py-0.5 rounded border text-[11px] font-mono outline-none flex-grow max-w-[170px] ${
            isLightTheme ? 'bg-white border-slate-250 text-slate-700' : 'bg-[#252526] border-slate-705 text-slate-300'
          }`}
        >
          {['all', 'javascript', 'typescript', 'python', 'json', 'html', 'css', 'markdown', 'shell', 'plaintext'].map(lang => (
            <option key={lang} value={lang}>
              {lang.toUpperCase()}
            </option>
          ))}
        </select>
      </div>

      {/* Recent Files panel widget */}
      {actualRecentFiles.length > 0 && selectedLanguage === 'all' && (
        <div className={`border-b ${isLightTheme ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-[#202021]/60'}`}>
          <button
            onClick={() => setShowRecents(!showRecents)}
            className="w-full px-3 py-1.5 flex items-center justify-between text-left text-[9px] font-mono tracking-widest uppercase opacity-75 hover:opacity-100 transition-opacity"
          >
            <span>RECENTS ({actualRecentFiles.length})</span>
            <ChevronDown className={`w-3 h-3 transform transition-transform ${showRecents ? '' : '-rotate-90'}`} />
          </button>
          
          {showRecents && (
            <div className="px-2 pb-2 max-h-32 overflow-y-auto flex flex-col gap-1.5 scrollbar-thin">
              {actualRecentFiles.map(recent => {
                const isSelected = activeFileId === recent._id;
                return (
                  <div
                    key={recent._id}
                    onClick={() => onSelectFile(recent._id)}
                    className={`flex items-center space-x-2 py-1 px-2 rounded cursor-pointer transition-all ${
                      isSelected
                        ? isLightTheme
                          ? 'bg-blue-105 text-blue-700 font-semibold'
                          : 'bg-blue-600/15 text-blue-300 border-l border-blue-500 font-semibold'
                        : 'text-xs text-slate-400 hover:text-slate-100 hover:bg-slate-500/10'
                    }`}
                  >
                    {getFileIcon(recent.name)}
                    <span className="truncate font-mono text-[11px]">{recent.name}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ZIP Status panel */}
      {zipUploading && (
        <div className="p-2.5 bg-blue-600/15 border-b border-blue-500/30 text-[11px] text-blue-400 flex items-center space-x-2 font-mono">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>{zipMessage}</span>
        </div>
      )}

      {/* Primary Tree Structure Wrapper */}
      <div className="flex-1 overflow-y-auto p-2 scrollbar-thin">
        {/* Inline item creation at Root Level */}
        {creatingInFolderId === null && creatingType && (
          <div className="flex items-center space-x-2 py-1 px-2.5 border border-dashed border-blue-500/40 rounded bg-blue-500/5 mb-1 animate-pulse">
            {creatingType === 'file' ? <File className="w-4 h-4 text-slate-400" /> : <FolderClosed className="w-4 h-4 text-yellow-500" />}
            <input
              type="text"
              autoFocus
              placeholder={creatingType === 'file' ? 'main.ts' : 'my-folder'}
              value={creatingValue}
              onChange={e => setCreatingValue(e.target.value)}
              onBlur={executeCreateInline}
              onKeyDown={e => e.key === 'Enter' && executeCreateInline()}
              className={`text-xs px-1.5 py-1 rounded outline-none border focus:border-blue-500 w-full ${
                isLightTheme ? 'bg-white border-slate-300 text-slate-800' : 'bg-[#1e1e1e] border-slate-700 text-slate-100'
              }`}
            />
          </div>
        )}

        {/* Dynamic Nodes */}
        {folders.length === 0 && files.length === 0 ? (
          <div className="text-center py-10 opacity-50 text-[10px] uppercase tracking-wider font-mono px-3">
            <Info className="w-6 h-6 mx-auto mb-2 text-slate-400" />
            Workspace empty. Right click here to create files!
          </div>
        ) : (
          renderTreeNodes(null, 0)
        )}
      </div>

      {/* Recycle Bin Sidebar Trigger */}
      <div className={`p-2.5 border-t flex items-center justify-between ${isLightTheme ? 'border-slate-200' : 'border-slate-800'}`}>
        <button
          id="sidebar-trash-bin-trigger"
          onClick={onOpenTrashBin}
          className={`flex items-center space-x-2 w-full py-1.5 px-2 rounded-md border text-xs transition-colors hover:text-white ${
            isLightTheme
              ? 'border-slate-300 bg-white hover:bg-slate-50 text-slate-700 hover:border-slate-400'
              : 'border-slate-800 bg-[#1e1e1e]/40 text-slate-400 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20'
          }`}
        >
          <Trash className="w-4 h-4 text-red-400 flex-shrink-0" />
          <span className="font-mono">Open Recycle Bin (Trash)</span>
        </button>
      </div>

      {/* ABSOLUTE RIGHT-CLICK CONTEXT MENU OVERLAY */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          className={`fixed z-50 min-w-[170px] shadow-2xl border rounded-lg p-1 animate-scale-in text-xs font-sans ${
            isLightTheme ? 'bg-white border-slate-200 text-slate-800' : 'bg-[#252526] border-slate-700 text-slate-100'
          }`}
          onClick={() => setContextMenu(null)}
        >
          {contextMenu.itemType === 'root' ? (
            <>
              <button
                onClick={() => {
                  setCreatingInFolderId(null);
                  setCreatingType('file');
                }}
                className="w-full text-left flex items-center space-x-2.5 py-1.5 px-3 rounded hover:bg-blue-600 hover:text-white"
              >
                <Plus className="w-3.5 h-3.5 text-blue-400" />
                <span>Create File</span>
              </button>
              <button
                onClick={() => {
                  setCreatingInFolderId(null);
                  setCreatingType('folder');
                }}
                className="w-full text-left flex items-center space-x-2.5 py-1.5 px-3 rounded hover:bg-blue-600 hover:text-white"
              >
                <FolderPlus className="w-3.5 h-3.5 text-yellow-500" />
                <span>Create Folder</span>
              </button>
              {copiedFileId && (
                <button
                  onClick={() => onPasteFile(null)}
                  className="w-full text-left flex items-center space-x-2.5 py-1.5 px-3 border-t border-slate-500/10 mt-1 rounded hover:bg-blue-600 hover:text-white"
                >
                  <Clipboard className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Paste File</span>
                </button>
              )}
            </>
          ) : (
            <>
              <button
                onClick={() => {
                  setRenamingItemId(contextMenu.itemId);
                  setRenamingItemType(contextMenu.itemType as 'file' | 'folder');
                  const item =
                    contextMenu.itemType === 'file'
                      ? files.find(f => f._id === contextMenu.itemId)
                      : folders.find(f => f._id === contextMenu.itemId);
                  setRenamingValue(item ? item.name : '');
                }}
                className="w-full text-left flex items-center space-x-2.5 py-1.5 px-3 rounded hover:bg-blue-600 hover:text-white"
              >
                <Plus className="w-3.5 h-3.5 opacity-50" />
                <span>Rename Item</span>
              </button>
              {contextMenu.itemType === 'file' && (
                <button
                  onClick={() => contextMenu.itemId && onCopyFile(contextMenu.itemId)}
                  className="w-full text-left flex items-center space-x-2.5 py-1.5 px-3 rounded hover:bg-blue-600 hover:text-white"
                >
                  <Clipboard className="w-3.5 h-3.5 text-slate-400" />
                  <span>Copy File Item</span>
                </button>
              )}
              {contextMenu.itemType === 'folder' && (
                <>
                  <button
                    onClick={() => {
                      setCreatingInFolderId(contextMenu.itemId);
                      setCreatingType('file');
                    }}
                    className="w-full text-left flex items-center space-x-2.5 py-1.5 px-3 rounded hover:bg-blue-600 hover:text-white"
                  >
                    <Plus className="w-3.5 h-3.5 text-blue-400" />
                    <span>New File Here</span>
                  </button>
                  <button
                    onClick={() => {
                      setCreatingInFolderId(contextMenu.itemId);
                      setCreatingType('folder');
                    }}
                    className="w-full text-left flex items-center space-x-2.5 py-1.5 px-3 rounded hover:bg-blue-600 hover:text-white"
                  >
                    <FolderPlus className="w-3.5 h-3.5 text-yellow-500" />
                    <span>New Folder Here</span>
                  </button>
                  {copiedFileId && (
                    <button
                      onClick={() => onPasteFile(contextMenu.itemId)}
                      className="w-full text-left flex items-center space-x-2.5 py-1.5 px-3 border-t border-slate-500/10 mt-1 rounded hover:bg-blue-600 hover:text-white"
                    >
                      <Clipboard className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Paste File Here</span>
                    </button>
                  )}
                </>
              )}
              <button
                onClick={() => {
                  if (contextMenu.itemId) {
                    const id = contextMenu.itemId;
                    const type = contextMenu.itemType as 'file' | 'folder';
                    const name = type === 'file'
                      ? files.find(f => f._id === id)?.name || 'File'
                      : folders.find(f => f._id === id)?.name || 'Folder';
                    setDeleteConfirm({ id, name, type });
                  }
                  setContextMenu(null);
                }}
                className="w-full text-left flex items-center space-x-2.5 py-1.5 px-3 border-t border-slate-500/10 mt-1 text-red-500 rounded hover:bg-red-600 hover:text-white"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Move to Trash</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* Custom Styled Beautiful Confirmation Pop Up */}
      {deleteConfirm && (
        <div id="delete-confirmation-overlay animate-fade-in" className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`w-full max-w-sm rounded-xl p-5 border shadow-2xl transition-all ${
            isLightTheme ? 'bg-white border-slate-200 text-slate-800' : 'bg-[#252526] border-slate-755 text-slate-100'
          }`}>
            <div className="flex items-center space-x-2 text-red-500 mb-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0 animate-pulse" />
              <h3 className="text-xs font-semibold tracking-wider font-mono uppercase">Confirm Move to Trash</h3>
            </div>
            
            <p className="text-xs leading-relaxed mb-4 font-sans opacity-85">
              Are you sure you want to move the {deleteConfirm.type} <span className="font-mono font-bold text-amber-500">"{deleteConfirm.name}"</span> to the Recycle Bin? 
              {deleteConfirm.type === 'folder' && " This will recursively affect all items inside."}
            </p>
            
            <div className="flex justify-end space-x-2">
              <button
                id="cancel-delete-modal-btn"
                onClick={() => setDeleteConfirm(null)}
                className={`px-3 py-1.5 border rounded text-[10px] font-mono uppercase tracking-wider transition-colors cursor-pointer ${
                  isLightTheme ? 'hover:bg-slate-100 border-slate-300' : 'hover:bg-slate-800 border-slate-700'
                }`}
              >
                Cancel / Close
              </button>
              <button
                id="confirm-delete-modal-btn"
                onClick={async () => {
                  if (deleteConfirm.type === 'file') {
                    await onDeleteFile(deleteConfirm.id);
                  } else {
                    await onDeleteFolder(deleteConfirm.id);
                  }
                  setDeleteConfirm(null);
                }}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white rounded text-[10px] font-mono uppercase tracking-wider transition-colors cursor-pointer"
              >
                Move to Trash
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
