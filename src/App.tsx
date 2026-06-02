import React, { useState, useEffect } from 'react';
import {
  Folder,
  Search,
  Moon,
  Sun,
  Menu,
  X,
  Keyboard,
  LogOut,
  Sparkles,
  Bookmark,
  FileCheck,
  Terminal,
  Activity,
  AlertCircle,
  FileCode,
  CheckCircle2,
  Lock,
  Compass,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { Folder as FolderType, FileItem, Tab, LineAnnotation } from './types';

// Subcomponents
import AuthPage from './components/AuthPage';
import Sidebar from './components/Sidebar';
import EditorArea from './components/EditorArea';
import SearchPanel from './components/SearchPanel';
import ShortcutsModal from './components/ShortcutsModal';
import TrashBinModal from './components/TrashBinModal';
import SnippetsPanel from './components/SnippetsPanel';
import GlobalReplacePanel from './components/GlobalReplacePanel';
import IntegrationsPanel from './components/IntegrationsPanel';

export default function App() {
  // Authentication states
  const [user, setUser] = useState<{ id: string; username: string } | null>(null);
  const [authChecking, setAuthChecking] = useState(true);

  // Styling theme
  const [isLightTheme, setIsLightTheme] = useState(false);

  // File explorer states
  const [folders, setFolders] = useState<FolderType[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Activity Bar tabs & toggle
  const [activeSidebarTab, setActiveSidebarTab] = useState<'explorer' | 'search' | 'snippets' | 'replace' | 'integrations'>('explorer');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Tab views
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);

  // Keyboard and modal toggles
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [trashBinOpen, setTrashBinOpen] = useState(false);

  // Annotation states for active file
  const [annotations, setAnnotations] = useState<LineAnnotation[]>([]);

  // Clipboard support
  const [copiedFileId, setCopiedFileId] = useState<string | null>(null);

  // Global custom styled notification toasts
  const [toasts, setToasts] = useState<Array<{ id: string; text: string; type: 'success' | 'info' | 'error' }>>([]);

  const triggerToast = (text: string, type: 'success' | 'info' | 'error' = 'success') => {
    const tId = Math.random().toString();
    setToasts(prev => [...prev, { id: tId, text, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== tId));
    }, 4000);
  };

  // Check auth cookie on bootstrap
  useEffect(() => {
    checkAuthentication();
  }, []);

  const checkAuthentication = async () => {
    try {
      const response = await fetch('/api/auth/me');
      if (response.ok) {
        const data = await response.json();
        setUser({ id: data.user.userId, username: data.user.username });
        fetchWorkspaceData();
      } else {
        setUser(null);
        localStorage.removeItem('codevault-token');
      }
    } catch {
      setUser(null);
      localStorage.removeItem('codevault-token');
    } finally {
      setAuthChecking(false);
    }
  };

  // Fetch folders and files
  const fetchWorkspaceData = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/fs');
      if (response.ok) {
        const data = await response.json();
        setFolders(data.folders || []);
        setFiles(data.files || []);
      } else if (response.status === 401) {
        setUser(null);
        triggerToast('Session expired. Please log in again.', 'error');
      }
    } catch {
      triggerToast('Cannot sync with Workspace DB.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Update tabs or fetch annotations when active file drifts
  useEffect(() => {
    if (activeFileId) {
      fetchAnnotationsForFile(activeFileId);
    } else {
      setAnnotations([]);
    }
  }, [activeFileId]);

  const fetchAnnotationsForFile = async (fileId: string) => {
    try {
      const res = await fetch(`/api/annotations/${fileId}`);
      if (res.ok) {
        const data = await res.json();
        setAnnotations(data || []);
      }
    } catch {
      console.warn('Unable to sync statements highlights');
    }
  };

  // Formatter Core Endpoint
  const handlePrettifyFile = async (fileId: string, content: string): Promise<string> => {
    const file = files.find(f => f._id === fileId);
    if (!file) return content;

    try {
      const res = await fetch('/api/formatter/prettify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, language: file.language }),
      });
      const data = await res.json();
      if (res.ok) {
        triggerToast(`${file.name} formatted successfully.`, 'success');
        return data.formatted;
      } else {
        triggerToast(data.error || 'Syntax format errors discovered.', 'error');
        throw new Error(data.error);
      }
    } catch (err: any) {
      throw new Error(err.message || 'Formatting failed.');
    }
  };

  // Commit and Save File
  const handleSaveFile = async (fileId: string, content: string) => {
    const target = files.find(f => f._id === fileId);
    if (!target) return;

    try {
      const res = await fetch(`/api/fs/file/${fileId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (res.ok) {
        setFiles(prev => prev.map(f => (f._id === fileId ? { ...f, content: data.content } : f)));
        triggerToast(`Code saved: ${target.name}`, 'success');
      } else {
        triggerToast(data.error || 'Failed to save changes.', 'error');
      }
    } catch {
      triggerToast('Server storage connection timed out.', 'error');
    }
  };

  // Workspace Operations

  const handleCreateFile = async (name: string, folderId: string | null) => {
    try {
      const res = await fetch('/api/fs/file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          folderId,
          path: folderId ? `${getFolderPathTrace(folderId)}/${name}` : name,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setFiles(prev => [...prev, data]);
        triggerToast(`Created code file: ${name}`, 'success');

        // Open newly created file in active tabs instantly
        handleSelectFile(data._id);
        return data;
      } else {
        triggerToast(data.error || 'Create file failed.', 'error');
      }
    } catch {
      triggerToast('Server failed to commit file.', 'error');
    }
  };

  const handleCreateFolder = async (name: string, parentId: string | null) => {
    try {
      const res = await fetch('/api/fs/folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, parentId }),
      });
      const data = await res.json();
      if (res.ok) {
        setFolders(prev => [...prev, data]);
        triggerToast(`Created folder: ${name}`, 'success');
        return data;
      } else {
        triggerToast(data.error || 'Create folder failed.', 'error');
      }
    } catch {
      triggerToast('Server failed to commit folder.', 'error');
    }
  };

  const handleRenameFile = async (id: string, newName: string) => {
    try {
      const res = await fetch(`/api/fs/file/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      });
      const data = await res.json();
      if (res.ok) {
        setFiles(prev => prev.map(f => (f._id === id ? data : f)));
        setTabs(prev => prev.map(t => (t.fileId === id ? { ...t, name: newName } : t)));
        triggerToast(`File renamed to: ${newName}`, 'success');
      } else {
        triggerToast(data.error || 'Rename failed', 'error');
      }
    } catch {
      triggerToast('Server communication timeout', 'error');
    }
  };

  const handleRenameFolder = async (id: string, newName: string) => {
    try {
      const res = await fetch(`/api/fs/folder/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      });
      const data = await res.json();
      if (res.ok) {
        setFolders(prev => prev.map(f => (f._id === id ? data : f)));
        triggerToast(`Folder renamed to: ${newName}`, 'success');
      } else {
        triggerToast(data.error || 'Rename failed', 'error');
      }
    } catch {
      triggerToast('Server communication timeout', 'error');
    }
  };

  const handleDeleteFile = async (id: string) => {
    try {
      const res = await fetch(`/api/fs/file/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        handleCloseTab(id);
        await fetchWorkspaceData();
        triggerToast('File moved to recycle bin.', 'info');
      }
    } catch {
      triggerToast('Failed to trash file.', 'error');
    }
  };

  const handleDeleteFolder = async (id: string) => {
    try {
      const res = await fetch(`/api/fs/folder/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        // Sync folders state
        await fetchWorkspaceData();
        triggerToast('Folder moved to recycle bin recursively.', 'info');
      }
    } catch {
      triggerToast('Failed to trash folder.', 'error');
    }
  };

  const handleMoveFile = async (fileId: string, folderId: string | null) => {
    try {
      const targetFolder = folderId ? folders.find(f => f._id === folderId) : null;
      const response = await fetch(`/api/fs/file/${fileId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId }),
      });
      if (response.ok) {
        const data = await response.json();
        setFiles(prev => prev.map(f => (f._id === fileId ? data : f)));
        triggerToast(`Moved to ${targetFolder ? targetFolder.name : 'Workspace Root'}.`, 'success');
        await fetchWorkspaceData();
      }
    } catch {
      triggerToast('Failed to move item.', 'error');
    }
  };

  const handleMoveFolder = async (folderId: string, parentId: string | null) => {
    try {
      const targetParent = parentId ? folders.find(f => f._id === parentId) : null;
      const response = await fetch(`/api/fs/folder/${folderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentId }),
      });
      if (response.ok) {
        const data = await response.json();
        setFolders(prev => prev.map(f => (f._id === folderId ? data : f)));
        triggerToast(`Moved subfolder to ${targetParent ? targetParent.name : 'Workspace Root'}.`, 'success');
        await fetchWorkspaceData();
      }
    } catch {
      triggerToast('Failed to relocate folder group.', 'error');
    }
  };

  // Copy/Paste mechanism
  const handleCopyFile = (fileId: string) => {
    setCopiedFileId(fileId);
    const item = files.find(f => f._id === fileId);
    if (item) {
      triggerToast(`Copied copy-item: ${item.name}`, 'info');
    }
  };

  const handlePasteFile = async (targetFolderId: string | null) => {
    if (!copiedFileId) return;

    try {
      const source = files.find(f => f._id === copiedFileId);
      if (!source) {
        triggerToast('Copy buffer is empty or dead.', 'error');
        return;
      }

      // Generate paste name and path
      const pasteName = source.name.includes('.')
        ? source.name.replace(/(\.[^.]+)$/, ' - Copy$1')
        : `${source.name} - Copy`;

      const pathPrefix = targetFolderId ? getFolderPathTrace(targetFolderId) : '';
      const pastePath = pathPrefix ? `${pathPrefix}/${pasteName}` : pasteName;

      // Commit deep copy
      const res = await fetch('/api/fs/file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: pasteName,
          content: source.content,
          language: source.language,
          path: pastePath,
          folderId: targetFolderId,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setFiles(prev => [...prev, data]);
        triggerToast(`Pasted item copy successfully!`, 'success');
        handleSelectFile(data._id);
      } else {
        triggerToast(data.error || 'Pasting file copy error.', 'error');
      }
    } catch {
      triggerToast('Network lost during copying procedure.', 'error');
    }
  };

  // Annotative Actions
  const handleAddAnnotation = async (lineNumber: number, note: string, color: string | null) => {
    if (!activeFileId) return;
    try {
      const res = await fetch(`/api/annotations/${activeFileId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineNumber, note, highlightColor: color }),
      });
      if (res.ok) {
        await fetchAnnotationsForFile(activeFileId);
        triggerToast(`Annotation mapped on line #${lineNumber}`, 'success');
      }
    } catch {
      triggerToast('Fail to save notes highlight.', 'error');
    }
  };

  const handleDeleteAnnotation = async (lineNumber: number) => {
    if (!activeFileId) return;
    try {
      const res = await fetch(`/api/annotations/${activeFileId}/${lineNumber}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        await fetchAnnotationsForFile(activeFileId);
        triggerToast(`Dissolved annotation on line #${lineNumber}`, 'info');
      }
    } catch {
      triggerToast('Db was unable to drop annotations line.', 'error');
    }
  };

  // Helper folder path tracer
  const getFolderPathTrace = (folderId: string): string => {
    const parts: string[] = [];
    let currentId: string | null = folderId;
    while (currentId) {
      const match = folders.find(f => f._id === currentId);
      if (match) {
        parts.unshift(match.name);
        currentId = match.parentId;
      } else {
        break;
      }
    }
    return parts.join('/');
  };

  const getBreadcrumbPathStr = (): string => {
    const active = files.find(f => f._id === activeFileId);
    if (!active) return '';
    const parts: string[] = [active.name];
    let parentId = active.folderId;
    while (parentId) {
      const mFolder = folders.find(f => f._id === parentId);
      if (mFolder) {
        parts.unshift(mFolder.name);
        parentId = mFolder.parentId;
      } else {
        break;
      }
    }
    return parts.join(' / ');
  };

  // TABS & NAV OPERATIONS

  const handleSelectFile = (fileId: string) => {
    const file = files.find(f => f._id === fileId);
    if (!file) return;

    setActiveFileId(fileId);

    // Add to tabs if missing
    setTabs(prev => {
      const exists = prev.some(t => t.fileId === fileId);
      if (exists) return prev;
      return [...prev, { fileId, name: file.name, isDirty: false }];
    });

    // Close sidebar overlay on select file modal in responsive viewports
    setMobileSidebarOpen(false);
  };

  const handleCloseTab = (fileId: string) => {
    setTabs(prev => {
      const filtered = prev.filter(t => t.fileId !== fileId);
      if (activeFileId === fileId) {
        if (filtered.length > 0) {
          setActiveFileId(filtered[filtered.length - 1].fileId);
        } else {
          setActiveFileId(null);
        }
      }
      return filtered;
    });
  };

  const handleMarkTabUnsaved = (fileId: string, isDirty: boolean) => {
    setTabs(prev => prev.map(t => (t.fileId === fileId ? { ...t, isDirty } : t)));
  };

  const handleLogout = async () => {
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' });
      setUser(null);
      setTabs([]);
      setActiveFileId(null);
      localStorage.removeItem('codevault-token');
      triggerToast('Locked Sandbox. Session logged out.', 'info');
    } catch {
      setUser(null);
      setTabs([]);
      setActiveFileId(null);
      localStorage.removeItem('codevault-token');
      triggerToast('Network logging out failure.', 'error');
    }
  };

  // Render Loader Area
  if (authChecking) {
    return (
      <div className={`flex flex-col items-center justify-center min-h-screen ${isLightTheme ? 'bg-slate-50 text-slate-800' : 'bg-[#1e1e1e] text-slate-200'}`}>
        <Activity className="w-10 h-10 animate-spin text-blue-500 mb-3" />
        <p className="text-xs font-mono tracking-widest uppercase opacity-70">Verifying session crypt-keys...</p>
      </div>
    );
  }

  // Not Authenticated screen
  if (!user) {
    return <AuthPage onAuthSuccess={u => { setUser(u); fetchWorkspaceData(); }} isLightTheme={isLightTheme} />;
  }

  // Workspace layout variables
  const activeFile = files.find(f => f._id === activeFileId) || null;
  const currentTab = tabs.find(t => t.fileId === activeFileId);
  const activeFileDirty = currentTab ? currentTab.isDirty : false;

  return (
    <div id="codevault-app-applet" className={`flex flex-col h-screen overflow-hidden font-sans relative ${isLightTheme ? 'bg-white light-grid-bg text-slate-900' : 'bg-[#151515] coder-grid-bg text-slate-200'}`}>
      {/* Visual Floating Toasts Alerts */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`p-3 px-4 rounded-lg shadow-2xl text-xs font-semibold flex items-center space-x-2 border animate-fade-in pointer-events-auto ${
              t.type === 'success'
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                : t.type === 'error'
                  ? 'bg-red-500/15 border-red-500/30 text-red-400'
                  : 'bg-blue-500/15 border-blue-500/30 text-blue-400'
            }`}
          >
            {t.type === 'success' && <CheckCircle2 className="w-4 h-4 flex-shrink-0" />}
            {t.type === 'error' && <AlertCircle className="w-4 h-4 flex-shrink-0" />}
            {t.type === 'info' && <Terminal className="w-4 h-4 flex-shrink-0" />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>

      {/* Main Container Core */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* THIN LEFT SIDE ACTIVITY BAR (VS Code Style) */}
        <div className={`w-12 h-full flex flex-col justify-between items-center py-4 border-r shrink-0 hidden sm:flex ${
          isLightTheme ? 'bg-slate-100 border-slate-200' : 'bg-[#181818] border-slate-800'
        }`}>
          {/* Main sections */}
          <div className="flex flex-col items-center space-y-4">
            {/* Logo */}
            <div className="p-1 px-1 text-blue-500 mb-2" title="CodeVault Workspace Master">
              <Compass className="w-6 h-6 animate-spin-slow" />
            </div>

            {/* Sidebar Collapse Toggle Button */}
            <button
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className={`p-2 rounded-lg relative cursor-pointer group transition-colors text-amber-500 hover:bg-slate-500/10 ${
                isSidebarCollapsed ? 'bg-amber-500/10' : ''
              }`}
              title={isSidebarCollapsed ? "Expand Code Sidebar" : "Collapse Code Sidebar"}
            >
              {isSidebarCollapsed ? <ChevronRight className="w-5 h-5 animate-pulse" /> : <ChevronLeft className="w-5 h-5" />}
              <span className="absolute left-10 scale-0 group-hover:scale-100 bg-[#333] text-white text-[10px] uppercase font-mono tracking-wider p-1 py-0.5 rounded ml-2 whitespace-nowrap z-50">
                {isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
              </span>
            </button>

            {/* Folder Browser Tab */}
            <button
              onClick={() => setActiveSidebarTab('explorer')}
              className={`p-2 rounded-lg relative cursor-pointer group transition-colors hover:text-white ${
                activeSidebarTab === 'explorer'
                  ? 'text-blue-500 bg-blue-500/10 border border-blue-500/20'
                  : 'text-slate-400 hover:bg-slate-500/10'
              }`}
              title="Explorer Nodes"
            >
              <Folder className="w-5 h-5" />
              <span className="absolute left-10 scale-0 group-hover:scale-100 bg-[#333] text-white text-[10px] uppercase font-mono tracking-wider p-1 py-0.5 rounded ml-2 whitespace-nowrap z-50">
                Explorer
              </span>
            </button>

            {/* Global Search Tab */}
            <button
              onClick={() => setActiveSidebarTab('search')}
              className={`p-2 rounded-lg relative cursor-pointer group transition-colors hover:text-white ${
                activeSidebarTab === 'search'
                  ? 'text-blue-500 bg-blue-500/10 border border-blue-500/20'
                  : 'text-slate-400 hover:bg-slate-500/10'
              }`}
              title="Global Database Index Scan"
            >
              <Search className="w-5 h-5" />
              <span className="absolute left-10 scale-0 group-hover:scale-100 bg-[#333] text-white text-[10px] uppercase font-mono tracking-wider p-1 py-0.5 rounded ml-2 whitespace-nowrap z-50">
                Search Code
              </span>
            </button>

            {/* Code Snippets Library Tab */}
            <button
              onClick={() => setActiveSidebarTab('snippets')}
              className={`p-2 rounded-lg relative cursor-pointer group transition-colors hover:text-white ${
                activeSidebarTab === 'snippets'
                  ? 'text-blue-500 bg-blue-500/10 border border-blue-500/20'
                  : 'text-slate-400 hover:bg-slate-500/10'
              }`}
              title="Snippets Library Manager"
            >
              <Bookmark className="w-5 h-5" />
              <span className="absolute left-10 scale-0 group-hover:scale-100 bg-[#333] text-white text-[10px] uppercase font-mono tracking-wider p-1 py-0.5 rounded ml-2 whitespace-nowrap z-50">
                Snippets Library
              </span>
            </button>

            {/* Global Replace Tab */}
            <button
              onClick={() => setActiveSidebarTab('replace')}
              className={`p-2 rounded-lg relative cursor-pointer group transition-colors hover:text-white ${
                activeSidebarTab === 'replace'
                  ? 'text-blue-500 bg-blue-500/10 border border-blue-500/20'
                  : 'text-slate-400 hover:bg-slate-500/10'
              }`}
              title="Global Bulk Replace"
            >
              <FileCheck className="w-5 h-5" />
              <span className="absolute left-10 scale-0 group-hover:scale-100 bg-[#333] text-white text-[10px] uppercase font-mono tracking-wider p-1 py-0.5 rounded ml-2 whitespace-nowrap z-50">
                Bulk Replace
              </span>
            </button>

            {/* Portability Integrations Tab */}
            <button
              onClick={() => setActiveSidebarTab('integrations')}
              className={`p-2 rounded-lg relative cursor-pointer group transition-colors hover:text-white ${
                activeSidebarTab === 'integrations'
                  ? 'text-blue-500 bg-blue-500/10 border border-blue-500/20'
                  : 'text-slate-400 hover:bg-slate-500/10'
              }`}
              title="Git Gist & ZIP Portability"
            >
              <Compass className="w-5 h-5" />
              <span className="absolute left-10 scale-0 group-hover:scale-100 bg-[#333] text-white text-[10px] uppercase font-mono tracking-wider p-1 py-0.5 rounded ml-2 whitespace-nowrap z-50">
                Portability Integrations
              </span>
            </button>
          </div>

          {/* Bottom Settings/Exit actions */}
          <div className="flex flex-col items-center space-y-4">
            {/* Keyboard Shortcuts menu trigger */}
            <button
              onClick={() => setShortcutsOpen(true)}
              className="p-2 rounded-lg text-slate-400 hover:bg-slate-500/10 hover:text-white transition-colors"
              title="Keyboard Shortcuts Guide"
            >
              <Keyboard className="w-5 h-5" />
            </button>

            {/* Theme Switcher Toggle */}
            <button
              onClick={() => setIsLightTheme(!isLightTheme)}
              className="p-2 rounded-lg text-amber-400 hover:bg-slate-500/10 hover:text-slate-50 transition-colors"
              title="Switch Color Themes"
            >
              {isLightTheme ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
            </button>

            {/* Secure SignOut lockout */}
            <button
              id="sidebar-signout-btn"
              onClick={handleLogout}
              className="p-2 rounded-lg text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
              title="Sign Out Session"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* SIDEBAR PANEL DRAWER VIEWER */}
        {!isSidebarCollapsed && (
          <div id="side-drawer" className={`w-72 h-full shrink-0 flex-col overflow-hidden sm:flex border-r hidden ${
            isLightTheme ? 'border-slate-200' : 'border-slate-800'
          }`}>
          {activeSidebarTab === 'explorer' && (
            <Sidebar
              folders={folders}
              files={files}
              activeFileId={activeFileId}
              onSelectFile={handleSelectFile}
              onCreateFile={handleCreateFile}
              onCreateFolder={handleCreateFolder}
              onRenameFile={handleRenameFile}
              onRenameFolder={handleRenameFolder}
              onDeleteFile={handleDeleteFile}
              onDeleteFolder={handleDeleteFolder}
              onMoveFile={handleMoveFile}
              onMoveFolder={handleMoveFolder}
              onCopyFile={handleCopyFile}
              onPasteFile={handlePasteFile}
              copiedFileId={copiedFileId}
              onOpenTrashBin={() => setTrashBinOpen(true)}
              isLightTheme={isLightTheme}
              onRefreshWorkspace={fetchWorkspaceData}
            />
          )}
          {activeSidebarTab === 'search' && (
            <SearchPanel
              onSelectResult={(id, ln) => {
                handleSelectFile(id);
                // Trigger line margins jumping overlay delay
                setTimeout(() => {
                  window.dispatchEvent(new CustomEvent('codevault-query-match', { detail: { line: ln } }));
                }, 150);
              }}
              isLightTheme={isLightTheme}
            />
          )}
          {activeSidebarTab === 'snippets' && (
            <SnippetsPanel
              isLightTheme={isLightTheme}
              activeFileId={activeFileId}
              onRefreshWorkspace={fetchWorkspaceData}
              triggerToast={triggerToast}
            />
          )}
          {activeSidebarTab === 'replace' && (
            <GlobalReplacePanel
              isLightTheme={isLightTheme}
              onRefreshWorkspace={fetchWorkspaceData}
              triggerToast={triggerToast}
            />
          )}
          {activeSidebarTab === 'integrations' && (
            <IntegrationsPanel
              isLightTheme={isLightTheme}
              onRefreshWorkspace={fetchWorkspaceData}
              triggerToast={triggerToast}
            />
          )}
        </div>
        )}

        {/* MOBILE SIDEBAR PANEL OVERLAY DRAWER */}
        {mobileSidebarOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 sm:hidden flex">
            <div className={`w-80 h-full p-1 border-r flex flex-col relative ${
              isLightTheme ? 'bg-white border-slate-200' : 'bg-[#1e1e1e] border-slate-800'
            }`}>
              <button
                onClick={() => setMobileSidebarOpen(false)}
                className="absolute top-3.5 right-3 p-1.5 rounded-md text-slate-400 hover:bg-slate-500/10 active:bg-slate-500/20"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex-1 overflow-hidden mt-6">
                <div className="flex border-b border-slate-500/10 mb-4 px-2 overflow-x-auto whitespace-nowrap scrollbar-none gap-2">
                  {['explorer', 'search', 'snippets', 'replace', 'integrations'].map(tab => (
                    <button
                      key={tab}
                      onClick={() => setActiveSidebarTab(tab as any)}
                      className={`pb-2 px-1 font-mono text-[10px] uppercase tracking-wider shrink-0 select-none ${
                        activeSidebarTab === tab
                          ? 'border-b-2 border-blue-500 text-blue-400 font-bold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>

                <div className="flex-grow h-full overflow-hidden">
                  {activeSidebarTab === 'explorer' && (
                    <Sidebar
                      folders={folders}
                      files={files}
                      activeFileId={activeFileId}
                      onSelectFile={handleSelectFile}
                      onCreateFile={handleCreateFile}
                      onCreateFolder={handleCreateFolder}
                      onRenameFile={handleRenameFile}
                      onRenameFolder={handleRenameFolder}
                      onDeleteFile={handleDeleteFile}
                      onDeleteFolder={handleDeleteFolder}
                      onMoveFile={handleMoveFile}
                      onMoveFolder={handleMoveFolder}
                      onCopyFile={handleCopyFile}
                      onPasteFile={handlePasteFile}
                      copiedFileId={copiedFileId}
                      onOpenTrashBin={() => { setTrashBinOpen(true); setMobileSidebarOpen(false); }}
                      isLightTheme={isLightTheme}
                      onRefreshWorkspace={fetchWorkspaceData}
                    />
                  )}
                  {activeSidebarTab === 'search' && (
                    <SearchPanel
                      onSelectResult={(id, ln) => {
                        handleSelectFile(id);
                        setTimeout(() => {
                          window.dispatchEvent(new CustomEvent('codevault-query-match', { detail: { line: ln } }));
                        }, 150);
                      }}
                      isLightTheme={isLightTheme}
                    />
                  )}
                  {activeSidebarTab === 'snippets' && (
                    <SnippetsPanel
                      isLightTheme={isLightTheme}
                      activeFileId={activeFileId}
                      onRefreshWorkspace={fetchWorkspaceData}
                      triggerToast={triggerToast}
                    />
                  )}
                  {activeSidebarTab === 'replace' && (
                    <GlobalReplacePanel
                      isLightTheme={isLightTheme}
                      onRefreshWorkspace={fetchWorkspaceData}
                      triggerToast={triggerToast}
                    />
                  )}
                  {activeSidebarTab === 'integrations' && (
                    <IntegrationsPanel
                      isLightTheme={isLightTheme}
                      onRefreshWorkspace={fetchWorkspaceData}
                      triggerToast={triggerToast}
                    />
                  )}
                </div>
              </div>

              {/* Mobile Quick Utility Actions row */}
              <div className="border-t border-slate-500/10 p-3 flex justify-between items-center">
                <button
                  onClick={() => setIsLightTheme(!isLightTheme)}
                  className="p-1 px-3 bg-slate-500/10 rounded flex items-center space-x-1.5 text-xs text-slate-400 hover:text-white"
                >
                  {isLightTheme ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5 text-amber-500" />}
                  <span>Theme</span>
                </button>
                <button
                  onClick={() => { setShortcutsOpen(true); setMobileSidebarOpen(false); }}
                  className="p-1 px-3 bg-slate-500/10 rounded flex items-center space-x-1.5 text-xs text-slate-400"
                >
                  <Keyboard className="w-3.5 h-3.5 text-blue-400" />
                  <span>Keys</span>
                </button>
                <button
                  onClick={handleLogout}
                  className="p-1 px-3 bg-red-500/10 rounded flex items-center space-x-1.5 text-xs text-red-400 font-semibold"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Logout</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* WORKSPACE MAIN EDITOR AREA */}
        <div className="flex-1 flex flex-col h-full overflow-hidden relative">
          {/* Top Tabs panel + Hamburger mobile launcher */}
          <div className={`flex items-center justify-between border-b shrink-0 ${
            isLightTheme ? 'bg-slate-100/40 border-slate-200' : 'bg-[#181818] border-slate-800'
          }`}>
            {/* Left Mobile Sidebar toggle and Logo */}
            <div className="flex items-center sm:hidden p-2">
              <button
                id="mobile-hamburger-btn"
                onClick={() => setMobileSidebarOpen(true)}
                className="p-1.5 rounded hover:bg-slate-500/10 active:bg-slate-500/20 text-slate-400"
              >
                <Menu className="w-5 h-5" />
              </button>
              <span className="text-xs font-semibold uppercase tracking-wider font-mono text-blue-500 ml-1">
                CodeVault
              </span>
            </div>

            {/* List of tabs opened */}
            <div className="flex-1 flex overflow-x-auto whitespace-nowrap scrollbar-none scroll-smooth">
              {tabs.map(t => {
                const isSelected = activeFileId === t.fileId;
                return (
                  <div
                    key={t.fileId}
                    id={`explorer-tab-${t.fileId}`}
                    onClick={() => handleSelectFile(t.fileId)}
                    className={`h-10 px-4 flex items-center space-x-2 border-r text-xs transition-colors cursor-pointer shrink-0 scroll-mx-4 ${
                      isSelected
                        ? isLightTheme
                          ? 'bg-white text-slate-900 border-t-2 border-t-blue-500 font-medium border-r-slate-200 shadow-sm'
                          : 'bg-[#1e1e1e] text-slate-100 border-t-2 border-t-blue-500 font-medium border-r-slate-800'
                        : isLightTheme
                          ? 'bg-slate-100 text-slate-500 hover:bg-slate-50 border-r-slate-200'
                          : 'bg-[#161616] text-slate-400 hover:bg-[#202020] border-r-slate-800/80'
                    }`}
                  >
                    <FileCode className={`w-3.5 h-3.5 flex-shrink-0 ${isSelected ? 'text-blue-500' : 'text-slate-400'}`} />
                    <span className="truncate max-w-[120px] font-mono">{t.name}</span>
                    {t.isDirty && (
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0 ml-1 animate-pulse" title="Unsaved edits" />
                    )}
                    <button
                      id={`close-tab-btn-${t.fileId}`}
                      onClick={e => {
                        e.stopPropagation();
                        handleCloseTab(t.fileId);
                      }}
                      className="p-0.5 rounded hover:bg-slate-500/15 text-slate-400 hover:text-slate-200 flex-shrink-0 text-[10px]"
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Primary EditorArea Workspace Panel */}
          <div className="flex-1 h-full overflow-hidden">
            <EditorArea
              activeFile={activeFile}
              breadcrumbPath={getBreadcrumbPathStr()}
              isLightTheme={isLightTheme}
              onSaveFile={handleSaveFile}
              onPrettifyFile={handlePrettifyFile}
              annotations={annotations}
              onAddAnnotation={handleAddAnnotation}
              onDeleteAnnotation={handleDeleteAnnotation}
              onOpenShortcuts={() => setShortcutsOpen(true)}
              onMarkUnsaved={handleMarkTabUnsaved}
              isDirty={activeFileDirty}
              files={files}
            />
          </div>
        </div>
      </div>

      {/* --- FLOATING POPUP OVERLAYS --- */}

      {/* Keyboard Shortcuts Dialog */}
      {shortcutsOpen && (
        <ShortcutsModal onClose={() => setShortcutsOpen(false)} isLightTheme={isLightTheme} />
      )}

      {/* Recycle Bin Trash Manager Overlay */}
      {trashBinOpen && (
        <TrashBinModal
          onClose={() => setTrashBinOpen(false)}
          onRefreshWorkspace={fetchWorkspaceData}
          isLightTheme={isLightTheme}
        />
      )}
    </div>
  );
}
