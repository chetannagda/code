import React, { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import {
  Save,
  Lock,
  Unlock,
  Plus,
  Minus,
  Sparkles,
  Search,
  MessageSquare,
  Trash2,
  Trash,
  X,
  FileCheck,
  ChevronRight,
  Bookmark,
  Keyboard,
  Columns,
  Download,
  Image,
  MoreVertical
} from 'lucide-react';
import { FileItem, LineAnnotation } from '../types';

interface EditorAreaProps {
  activeFile: FileItem | null;
  breadcrumbPath: string;
  isLightTheme: boolean;
  onSaveFile: (fileId: string, content: string) => Promise<any>;
  onPrettifyFile: (fileId: string, content: string) => Promise<string>;
  annotations: LineAnnotation[];
  onAddAnnotation: (lineNumber: number, note: string, color: string | null) => Promise<any>;
  onDeleteAnnotation: (lineNumber: number) => Promise<any>;
  onOpenShortcuts: () => void;
  onMarkUnsaved: (fileId: string, isDirty: boolean) => void;
  isDirty: boolean;
  files: FileItem[];
}

export default function EditorArea({
  activeFile,
  breadcrumbPath,
  isLightTheme,
  onSaveFile,
  onPrettifyFile,
  annotations,
  onAddAnnotation,
  onDeleteAnnotation,
  onOpenShortcuts,
  onMarkUnsaved,
  isDirty,
  files,
}: EditorAreaProps) {
  const [editorValue, setEditorValue] = useState('');
  const [isEditMode, setIsEditMode] = useState(true);
  const [fontSize, setFontSize] = useState(13);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });

  // Annotations details panel
  const [activeAnnoLine, setActiveAnnoLine] = useState<number | null>(null);
  const [newAnnoNote, setNewAnnoNote] = useState('');
  const [newAnnoColor, setNewAnnoColor] = useState<string | null>('yellow');
  const [isNotesPanelOpen, setIsNotesPanelOpen] = useState(true);
  const [isBottomBarOpen, setIsBottomBarOpen] = useState(true);

  // Find & Replace panel
  const [findReplaceOpen, setFindReplaceOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');

  const editorRef = useRef<any>(null);

  // Split-Screen states
  const [isSplitActive, setIsSplitActive] = useState(false);
  const [splitFileId, setSplitFileId] = useState<string | null>(null);
  const [splitEditorValue, setSplitEditorValue] = useState('');
  const [splitIsDirty, setSplitIsDirty] = useState(false);
  const [splitIsEditMode, setSplitIsEditMode] = useState(true);
  const [splitLanguage, setSplitLanguage] = useState('plaintext');

  // Export menu states
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [threeDotMenuOpen, setThreeDotMenuOpen] = useState(false);
  
  // Custom text selection and highlight tracker
  const [textSelection, setTextSelection] = useState<{
    startLine: number;
    endLine: number;
    visible: boolean;
  } | null>(null);

  const [selectionActionView, setSelectionActionView] = useState<'menu' | 'colors'>('menu');

  const decorationsRef = useRef<string[]>([]);
  const monacoRef = useRef<any>(null);

  const handleApplySelectionHighlight = async (color: string | null) => {
    if (!textSelection || !activeFile) return;

    const { startLine, endLine } = textSelection;
    for (let line = startLine; line <= endLine; line++) {
      if (color === null) {
        await onDeleteAnnotation(line);
      } else {
        const existing = annotations.find(a => a.lineNumber === line);
        const noteText = existing ? existing.note : '';
        await onAddAnnotation(line, noteText, color);
      }
    }
    setTextSelection(null);
  };

  // Backdrop Image state managers (stored safely in local storage)
  const [backdropImg, setBackdropImg] = useState<string | null>(() => {
    return localStorage.getItem('codevault-editor-backdrop') || null;
  });
  const [backdropOpacity, setBackdropOpacity] = useState<number>(() => {
    return parseFloat(localStorage.getItem('codevault-editor-backdrop-opacity') || '0.12');
  });
  const [backdropMenuOpen, setBackdropMenuOpen] = useState(false);
  const bgFileInputRef = useRef<HTMLInputElement>(null);

  // Resize canvas compress helper to prevent QuotaExceededError in localStorage
  const compressAndStoreImage = (base64Str: string) => {
    const img = new window.Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 900;
      let width = img.width;
      let height = img.height;
      if (width > MAX_WIDTH) {
        height = Math.round((height * MAX_WIDTH) / width);
        width = MAX_WIDTH;
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.65);
        setBackdropImg(compressedBase64);
        try {
          localStorage.setItem('codevault-editor-backdrop', compressedBase64);
        } catch (e) {
          console.warn('LocalStorage size threshold reached.', e);
        }
      }
    };
  };

  const handleBgImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        compressAndStoreImage(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveBgImage = () => {
    setBackdropImg(null);
    localStorage.removeItem('codevault-editor-backdrop');
    setBackdropMenuOpen(false);
  };

  const handleOpacityChange = (val: number) => {
    setBackdropOpacity(val);
    localStorage.setItem('codevault-editor-backdrop-opacity', String(val));
  };

  // Client-side quick file download helper
  const downloadFileLocally = (name: string, content: string, asTxt: boolean) => {
    let finalName = name;
    if (asTxt) {
      const idx = name.lastIndexOf('.');
      finalName = (idx === -1 ? name : name.substring(0, idx)) + '.txt';
    }
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', finalName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setExportMenuOpen(false);
  };

  // Sync annotations as Monaco decorations
  useEffect(() => {
    if (!editorRef.current || !monacoRef.current || !activeFile) return;

    const editor = editorRef.current;
    const monaco = monacoRef.current;
    const model = editor.getModel();
    if (!model) return;

    const newDecorations = annotations.map(anno => {
      let className = '';
      let glyphClass = 'w-1 ml-1 rounded ';
      
      const themeColor = anno.highlightColor || 'yellow';
      if (themeColor === 'yellow') {
        className = 'editor-highlight-yellow';
        glyphClass += 'bg-yellow-400';
      } else if (themeColor === 'amber' || themeColor === 'orange') {
        className = 'editor-highlight-amber';
        glyphClass += 'bg-amber-500';
      } else if (themeColor === 'emerald' || themeColor === 'green') {
        className = 'editor-highlight-emerald';
        glyphClass += 'bg-emerald-500';
      } else if (themeColor === 'sky' || themeColor === 'blue') {
        className = 'editor-highlight-sky';
        glyphClass += 'bg-sky-400';
      } else if (themeColor === 'fuchsia' || themeColor === 'purple') {
        className = 'editor-highlight-fuchsia';
        glyphClass += 'bg-fuchsia-500';
      } else if (themeColor === 'rose' || themeColor === 'red') {
        className = 'editor-highlight-rose';
        glyphClass += 'bg-rose-500';
      }

      return {
        range: new monaco.Range(anno.lineNumber, 1, anno.lineNumber, 1),
        options: {
          isWholeLine: true,
          className: className,
          linesDecorationsClassName: glyphClass,
          minimap: { color: themeColor === 'yellow' ? '#f59e0b' : '#3d8df5', position: 1 }
        }
      };
    });

    decorationsRef.current = editor.deltaDecorations(decorationsRef.current, newDecorations);
  }, [annotations, activeFile]);

  // Listen for snippet insertion requests
  useEffect(() => {
    const handleInsertSnippet = (e: Event) => {
      const customEvent = e as CustomEvent<{ content: string }>;
      const { content } = customEvent.detail;
      if (!editorRef.current) {
        setEditorValue(prev => prev + '\n' + content);
        return;
      }
      
      const selection = editorRef.current.getSelection();
      const range = selection ? selection : new editorRef.current.getSelection();
      const id = { majorValue: 1, minorValue: 1 };
      const op = { identifier: id, range: range, text: content, forceMoveMarkers: true };
      editorRef.current.executeEdits("my-source-snippets-library", [op]);
      setEditorValue(editorRef.current.getValue());
    };

    window.addEventListener('codevault-insert-snippet', handleInsertSnippet);
    return () => window.removeEventListener('codevault-insert-snippet', handleInsertSnippet);
  }, [activeFile]);

  // Sync editor box value on tab/active file drift
  useEffect(() => {
    if (activeFile) {
      setEditorValue(activeFile.content);
    } else {
      setEditorValue('');
    }
    setActiveAnnoLine(null);
    setNewAnnoNote('');
  }, [activeFile]);

  // Trap external Ctrl keys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!activeFile) return;

      // Ctrl + S
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        triggerFormattedSave();
      }
      // Ctrl + H
      if ((e.ctrlKey || e.metaKey) && e.key === 'h') {
        e.preventDefault();
        setFindReplaceOpen(prev => !prev);
      }
      // Ctrl + K
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        onOpenShortcuts();
      }
      // Ctrl + /
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        toggleCommentOnActiveLine();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeFile, editorValue, cursorPos]);

  const handleEditorChange = (value: string | undefined) => {
    if (value === undefined) return;
    setEditorValue(value);
    if (activeFile) {
      // If content mismatch, set unsaved indicator to true
      const hasChanges = value !== activeFile.content;
      onMarkUnsaved(activeFile._id, hasChanges);
    }
  };

  const handleEditorMount = (editorInstance: any, monacoInstance: any) => {
    editorRef.current = editorInstance;
    monacoRef.current = monacoInstance;

    // Track line details
    editorInstance.onDidChangeCursorPosition((e: any) => {
      setCursorPos({
        line: e.position.lineNumber,
        col: e.position.column,
      });
    });

    // Handle cursor selections for multi-line highlight selector
    editorInstance.onDidChangeCursorSelection((e: any) => {
      const selection = e.selection;
      if (selection && !selection.isEmpty()) {
        setTextSelection({
          startLine: selection.startLineNumber,
          endLine: selection.endLineNumber,
          visible: true
        });
        setSelectionActionView('menu');
      }
    });

    // Handle line number click annotations
    editorInstance.onMouseDown((e: any) => {
      if (e.target.type === 2) { // Clicked line number area
        const clickedLine = e.target.position.lineNumber;
        handleLineNumberClick(clickedLine);
      }
    });
  };

  const handleLineNumberClick = (lineNum: number) => {
    setActiveAnnoLine(lineNum);
    const existing = annotations.find(a => a.lineNumber === lineNum);
    if (existing) {
      setNewAnnoNote(existing.note);
      setNewAnnoColor(existing.highlightColor);
    } else {
      setNewAnnoNote('');
      setNewAnnoColor('yellow');
    }
  };

  const triggerFormattedSave = async () => {
    if (!activeFile) return;
    // Perform standard prettifier then save content
    try {
      const prettified = await onPrettifyFile(activeFile._id, editorValue);
      setEditorValue(prettified);
      await onSaveFile(activeFile._id, prettified);
      onMarkUnsaved(activeFile._id, false);
    } catch {
      await onSaveFile(activeFile._id, editorValue);
      onMarkUnsaved(activeFile._id, false);
    }
  };

  const handleFormattedOnly = async () => {
    if (!activeFile) return;
    try {
      const prettified = await onPrettifyFile(activeFile._id, editorValue);
      setEditorValue(prettified);
      onMarkUnsaved(activeFile._id, true);
    } catch (err: any) {
      alert(err.message || 'Formatting failed.');
    }
  };

  // Comments toggler (Ctrl+/)
  const toggleCommentOnActiveLine = () => {
    if (!editorRef.current || !activeFile) return;

    const position = editorRef.current.getPosition();
    const model = editorRef.current.getModel();
    if (!position || !model) return;

    const lineNum = position.lineNumber;
    const lineContent = model.getLineContent(lineNum);

    const lang = activeFile.language.toLowerCase();
    const isHashComment = ['python', 'yaml', 'yml', 'robot'].includes(lang);
    const commentPrefix = isHashComment ? '#' : '//';

    let newLineContent = '';
    const trimmed = lineContent.trim();

    if (trimmed.startsWith(commentPrefix)) {
      // Uncomment
      const index = lineContent.indexOf(commentPrefix);
      let charsToRemove = commentPrefix.length;
      if (lineContent[index + commentPrefix.length] === ' ') {
        charsToRemove++;
      }
      newLineContent = lineContent.substring(0, index) + lineContent.substring(index + charsToRemove);
    } else {
      // Comment
      const spaceMatch = lineContent.match(/^\s*/);
      const leadingSpaces = spaceMatch ? spaceMatch[0] : '';
      newLineContent = leadingSpaces + commentPrefix + ' ' + trimmed;
    }

    // Apply the text change inside Monaco transaction model
    const edit = {
      range: { startLineNumber: lineNum, startColumn: 1, endLineNumber: lineNum, endColumn: lineContent.length + 1 },
      text: newLineContent,
      forceMoveMarkers: true,
    };
    editorRef.current.executeEdits('codevault-toggle-comment', [edit]);
  };

  // Delete current line
  const handleDeleteActiveLine = () => {
    if (!editorRef.current) return;
    const pos = editorRef.current.getPosition();
    const model = editorRef.current.getModel();
    if (!pos || !model) return;

    const lineNum = pos.lineNumber;
    const maxLines = model.getLineCount();

    let range;
    if (lineNum === maxLines && maxLines > 1) {
      range = {
        startLineNumber: lineNum - 1,
        startColumn: model.getLineContent(lineNum - 1).length + 1,
        endLineNumber: lineNum,
        endColumn: model.getLineContent(lineNum).length + 1
      };
    } else {
      range = {
        startLineNumber: lineNum,
        startColumn: 1,
        endLineNumber: lineNum + 1,
        endColumn: 1
      };
    }

    const edit = {
      range,
      text: '',
      forceMoveMarkers: true,
    };
    editorRef.current.executeEdits('codevault-delete-line', [edit]);
  };

  // Find & Replace
  const handleFindReplace = () => {
    if (!editorRef.current || !findQuery) return;
    const model = editorRef.current.getModel();
    if (!model) return;

    const text = editorValue;
    // Replace all occurrences of query
    const regex = new RegExp(findQuery.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g');
    const updated = text.replace(regex, replaceQuery);
    setEditorValue(updated);
    onMarkUnsaved(activeFile!._id, true);
  };

  // Add Annotation
  const handleSaveAnnotation = async () => {
    if (activeAnnoLine === null) return;
    await onAddAnnotation(activeAnnoLine, newAnnoNote, newAnnoColor);
    setActiveAnnoLine(null);
    setNewAnnoNote('');
  };

  const handleDeleteAnnotation = async (lineNum: number) => {
    await onDeleteAnnotation(lineNum);
    if (activeAnnoLine === lineNum) {
      setActiveAnnoLine(null);
      setNewAnnoNote('');
    }
  };

  if (!activeFile) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center select-none font-sans h-full relative overflow-hidden">
        {/* Unified Beautiful Hacker Background Decal inside Empty State */}
        {backdropImg && (
          <div
            className="pointer-events-none absolute inset-0 bg-cover bg-center z-0"
            style={{
              backgroundImage: `url(${backdropImg})`,
              opacity: backdropOpacity,
              mixBlendMode: isLightTheme ? 'multiply' : 'screen',
            }}
          />
        )}
        <div className="relative z-10 flex flex-col items-center justify-center">
          <Keyboard className="w-12 h-12 text-slate-500/40 mb-4 animate-bounce" />
          <h3 className="text-sm font-semibold tracking-wide uppercase opacity-75 mb-1.5 text-blue-400">No Active File Loaded</h3>
          <p className="text-xs text-slate-400 max-w-sm leading-relaxed font-sans">
            Select or double click any script file inside the sidebar browser explorer, or press <kbd className="px-1 py-0.5 border rounded bg-slate-500/10 font-mono text-[10px]">Ctrl+K</kbd> to view full system shortcuts.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div id="editor-area-wrapper" className="flex-1 flex flex-col h-full overflow-hidden select-none font-sans">
      {/* Editor Main Header Toolbar */}
      <div className={`p-2 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0 ${
        isLightTheme ? 'bg-slate-100/60 border-slate-200' : 'bg-[#1e1e1e] border-slate-800'
      }`}>
        {/* Breadcrumb Path */}
        <div className="flex items-center space-x-1.5 px-2 overflow-x-auto whitespace-nowrap scrollbar-none">
          <span className="text-[10px] font-mono tracking-wider opacity-60">root</span>
          {breadcrumbPath.split('/').filter(Boolean).map((p, idx) => (
            <React.Fragment key={idx}>
              <ChevronRight className="w-3 h-3 text-slate-500 flex-shrink-0" />
              <span className="text-xs font-semibold font-mono text-blue-400">{p}</span>
            </React.Fragment>
          ))}
          {isDirty && (
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse ml-2" title="Unsaved alterations" />
          )}
        </div>

        {/* Toolbar action buttons */}
        <div className="flex items-center space-x-1 sm:space-x-2 self-end sm:self-auto px-2">
          {/* Prettifier Button */}
          <button
            id="editor-prettify-btn"
            onClick={handleFormattedOnly}
            className="p-1.5 rounded hover:bg-slate-500/10 text-emerald-400 transition-colors flex items-center space-x-1"
            title="Prettify Formatter Code"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span className="text-[10px] font-semibold uppercase tracking-wider hidden md:inline">Format</span>
          </button>

          {/* Save Button */}
          <button
            id="editor-save-btn"
            onClick={triggerFormattedSave}
            className="p-1.5 rounded hover:bg-slate-500/10 text-blue-400 transition-colors flex items-center space-x-1"
            title="Format and Save Changes (Ctrl+S)"
          >
            <Save className="w-3.5 h-3.5" />
            <span className="text-[10px] font-semibold uppercase tracking-wider hidden md:inline">Save</span>
          </button>

          {/* Edit / View Switcher */}
          <button
            id="editor-mode-toggle"
            onClick={() => setIsEditMode(!isEditMode)}
            className={`p-1.5 rounded hover:bg-slate-500/10 transition-colors flex items-center space-x-1 ${
              isEditMode ? 'text-blue-400' : 'text-amber-500 font-semibold'
            }`}
            title="Toggle Lock/Unlock Editable Modes"
          >
            {isEditMode ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
            <span className="text-[10px] uppercase tracking-wider hidden md:inline">
              {isEditMode ? 'Edit' : 'View'}
            </span>
          </button>

          {/* Hidden Backdrop file input */}
          <input
            type="file"
            ref={bgFileInputRef}
            onChange={handleBgImageUpload}
            accept="image/*"
            className="hidden"
          />

          {/* Elegant Settings Three-Dot Toggle */}
          <div className="relative inline-block text-left">
            <button
              onClick={() => setThreeDotMenuOpen(!threeDotMenuOpen)}
              className={`p-1.5 rounded hover:bg-slate-500/10 transition-colors flex items-center space-x-1 cursor-pointer ${
                threeDotMenuOpen || isSplitActive || backdropImg ? 'text-amber-405 text-blue-400' : 'text-slate-400'
              }`}
              title="Editor Layout & Backdrop Customizer"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
            
            {threeDotMenuOpen && (
              <div className={`absolute right-0 mt-2.5 w-60 rounded-xl shadow-2xl p-4.5 z-50 border ${
                isLightTheme ? 'bg-white border-slate-200 text-slate-700' : 'bg-[#1a1a1b] border-slate-800 text-slate-200'
              }`} style={{ filter: 'drop-shadow(0 15px 15px rgba(0,0,0,0.4))' }}>
                <h3 className="text-[10px] font-mono tracking-widest uppercase opacity-65 mb-3 border-b border-slate-500/10 pb-1.5">IDE Customizations</h3>
                
                <div className="space-y-4">
                  {/* Split Screen View Button */}
                  <div className="flex items-center justify-between text-xs font-sans">
                    <span className="font-medium">Split-Screen View</span>
                    <button
                      onClick={() => {
                        setIsSplitActive(!isSplitActive);
                        if (isSplitActive) {
                          setSplitFileId(null);
                        }
                        setThreeDotMenuOpen(false);
                      }}
                      className={`px-2.5 py-1 text-[9.5px] uppercase font-mono tracking-wider rounded border transition-all ${
                        isSplitActive 
                          ? 'bg-blue-600/20 text-blue-400 border-blue-500/30' 
                          : 'bg-slate-500/10 text-slate-400 border-transparent hover:bg-slate-500/20'
                      }`}
                    >
                      {isSplitActive ? 'Active' : 'Enable'}
                    </button>
                  </div>

                  {/* Font Sizer */}
                  <div className="flex items-center justify-between text-xs font-sans">
                    <span className="font-medium">Text Size</span>
                    <div className="flex items-center space-x-1 bg-slate-500/10 rounded p-0.5">
                      <button
                        onClick={() => setFontSize(prev => Math.max(10, prev - 1))}
                        className="p-1 rounded hover:bg-slate-500/15 text-slate-450"
                        title="Decrease Size"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="text-[11px] font-mono font-semibold w-7 text-center">{fontSize}px</span>
                      <button
                        onClick={() => setFontSize(prev => Math.min(22, prev + 1))}
                        className="p-1 rounded hover:bg-slate-500/15 text-slate-450"
                        title="Increase Size"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* Download options */}
                  <div className="space-y-1.5 border-t border-slate-500/10 pt-3">
                    <span className="text-[9px] font-mono tracking-wider opacity-60 uppercase block">Local Code Download</span>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        onClick={() => {
                          downloadFileLocally(activeFile?.name || 'file.txt', editorValue, false);
                          setThreeDotMenuOpen(false);
                        }}
                        className={`text-center py-1.5 rounded text-[9.5px] font-mono transition-colors ${
                          isLightTheme ? 'bg-slate-100 hover:bg-slate-200 text-slate-800' : 'bg-slate-800 hover:bg-slate-700 text-white'
                        }`}
                      >
                        Original Ext
                      </button>
                      <button
                        onClick={() => {
                          downloadFileLocally(activeFile?.name || 'file.txt', editorValue, true);
                          setThreeDotMenuOpen(false);
                        }}
                        className={`text-center py-1.5 rounded text-[9.5px] font-mono transition-colors ${
                          isLightTheme ? 'bg-slate-100 hover:bg-slate-200 text-slate-800' : 'bg-slate-800 hover:bg-slate-700 text-white'
                        }`}
                      >
                        Plain.txt
                      </button>
                    </div>
                  </div>

                  {/* Workspace Toggles */}
                  <div className="space-y-2 border-t border-slate-500/10 pt-3">
                    <span className="text-[9px] font-mono tracking-wider opacity-60 uppercase block text-left">Layout Toggles</span>
                    
                    {/* Notes Panel Toggle */}
                    <div className="flex items-center justify-between text-xs font-sans">
                      <span className="font-medium text-[11px]">Line Notes Panel</span>
                      <button
                        onClick={() => setIsNotesPanelOpen(!isNotesPanelOpen)}
                        className={`px-1.5 py-0.5 text-[9px] font-mono rounded border transition-all cursor-pointer ${
                          isNotesPanelOpen 
                            ? 'bg-blue-600/20 text-blue-400 border-blue-500/30' 
                            : 'bg-slate-500/10 text-slate-400 border-transparent hover:bg-slate-500/20'
                        }`}
                      >
                        {isNotesPanelOpen ? 'Showing' : 'Hidden'}
                      </button>
                    </div>

                    {/* Status Bar Toggle */}
                    <div className="flex items-center justify-between text-xs font-sans">
                      <span className="font-medium text-[11px]">Bottom Status Bar</span>
                      <button
                        onClick={() => setIsBottomBarOpen(!isBottomBarOpen)}
                        className={`px-1.5 py-0.5 text-[9px] font-mono rounded border transition-all cursor-pointer ${
                          isBottomBarOpen 
                            ? 'bg-blue-600/20 text-blue-400 border-blue-500/30' 
                            : 'bg-slate-500/10 text-slate-400 border-transparent hover:bg-slate-500/20'
                        }`}
                      >
                        {isBottomBarOpen ? 'Showing' : 'Hidden'}
                      </button>
                    </div>
                  </div>

                  {/* Background Hologram Decorator */}
                  <div className="space-y-2 border-t border-slate-500/10 pt-3">
                    <span className="text-[9px] font-mono tracking-wider opacity-60 uppercase block">Code Hologram Background</span>
                    {backdropImg ? (
                      <div className="space-y-2">
                        <div className="h-10 w-full rounded border border-slate-500/15 bg-cover bg-center" style={{ backgroundImage: `url(${backdropImg})` }} />
                        <button
                          onClick={() => {
                            handleRemoveBgImage();
                            setThreeDotMenuOpen(false);
                          }}
                          className="w-full text-center py-1 text-[9px] rounded bg-red-600/15 hover:bg-red-600 text-red-400 hover:text-white transition-colors font-mono uppercase font-semibold"
                        >
                          Remove Image
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          bgFileInputRef.current?.click();
                          setThreeDotMenuOpen(false);
                        }}
                        className="w-full text-center py-1.5 rounded text-[9px] border border-dashed border-slate-500/30 hover:border-blue-500 text-slate-400 hover:text-blue-500 transition-colors bg-slate-50/5 font-mono uppercase font-semibold"
                      >
                        Set Background Image
                      </button>
                    )}

                    {backdropImg && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-[8px] font-mono opacity-65">
                          <span>Opacity:</span>
                          <span>{Math.round(backdropOpacity * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min="0.01"
                          max="0.40"
                          step="0.01"
                          value={backdropOpacity}
                          onChange={e => handleOpacityChange(parseFloat(e.target.value))}
                          className="w-full accent-blue-500 cursor-pointer h-1 rounded-lg bg-slate-700"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Find and Replace Bar */}
      {findReplaceOpen && (
        <div className={`p-2.5 border-b flex flex-wrap items-center gap-3 ${
          isLightTheme ? 'bg-slate-50 border-slate-200' : 'bg-[#151515] border-slate-800'
        }`}>
          <div className="flex items-center space-x-2">
            <span className="text-[10px] font-bold font-mono opacity-60">FIND:</span>
            <input
              id="find-query-input"
              type="text"
              value={findQuery}
              onChange={e => setFindQuery(e.target.value)}
              className={`text-xs px-2 py-1 rounded border outline-none ${
                isLightTheme ? 'bg-white border-slate-300 text-slate-800' : 'bg-[#1e1e1e] border-slate-700 text-slate-100'
              }`}
              placeholder="Query literal string"
            />
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-[10px] font-bold font-mono opacity-60">REPLACE:</span>
            <input
              id="replace-query-input"
              type="text"
              value={replaceQuery}
              onChange={e => setReplaceQuery(e.target.value)}
              className={`text-xs px-2 py-1 rounded border outline-none ${
                isLightTheme ? 'bg-white border-slate-300 text-slate-800' : 'bg-[#1e1e1e] border-slate-700 text-slate-100'
              }`}
              placeholder="Replacement string"
            />
          </div>
          <div className="flex space-x-2">
            <button
              id="replace-trigger-btn"
              onClick={handleFindReplace}
              className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-medium"
            >
              Replace All matches
            </button>
            <button
              onClick={() => setFindReplaceOpen(false)}
              className="p-1 rounded text-slate-400 hover:text-slate-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Editor Body Split Panel Area */}
      <div className="flex-1 flex h-full overflow-hidden relative flex-col lg:flex-row">
        {/* Unified Beautiful Hacker Background Decal */}
        {backdropImg && (
          <div
            className="pointer-events-none absolute inset-0 bg-cover bg-center z-10"
            style={{
              backgroundImage: `url(${backdropImg})`,
              opacity: backdropOpacity,
              mixBlendMode: isLightTheme ? 'multiply' : 'screen',
            }}
          />
        )}
        {/* LEFT OR MAIN EDITOR PANE */}
        <div className="flex-1 h-full min-h-[300px] lg:min-h-0 relative flex flex-col border-r border-slate-500/10">
          {isSplitActive && (
            <div className={`p-1.5 px-3 border-b flex justify-between items-center text-[10px] font-mono shrink-0 ${
              isLightTheme ? 'bg-slate-100 text-slate-700 border-slate-200' : 'bg-[#151515] text-slate-400 border-[#222]'
            }`}>
              <span>LEFT PANE: {activeFile.name} (ACTIVE PRIMARY)</span>
              <span className="text-blue-400 font-bold">SOURCE TARGET</span>
            </div>
          )}
          <div className="flex-grow relative h-full">
            <Editor
              height="100%"
              language={activeFile.language}
              value={editorValue}
              onChange={handleEditorChange}
              onMount={handleEditorMount}
              theme={isLightTheme ? 'vs' : 'vs-dark'}
              options={{
                readOnly: !isEditMode,
                lineNumbers: 'on',
                minimap: { enabled: false },
                wordWrap: 'on',
                fontSize: fontSize,
                tabSize: 2,
                scrollBeyondLastLine: false,
                automaticLayout: true,
              }}
            />

            {/* Custom Multi-Color Floating Selection Highlight Selector */}
            {textSelection && textSelection.visible && (
              <div 
                className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-slate-900/90 backdrop-blur-md border border-slate-700/60 shadow-2xl rounded-xl px-4 py-2 z-40 flex items-center space-x-3 transition-transform animate-in fade-in zoom-in-90 duration-150"
                style={{ boxShadow: '0 0 25px rgba(59, 130, 246, 0.35)' }}
              >
                {selectionActionView === 'menu' ? (
                  <>
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-300">
                      Selection (Lines {textSelection.startLine}-{textSelection.endLine}):
                    </span>
                    <button
                      onClick={() => {
                        // 1. Monaco native copy
                        editorRef.current?.trigger('keyboard', 'editor.action.clipboardCopyAction');
                        // 2. Clipboard API fallback as backup
                        if (editorRef.current) {
                          const val = editorRef.current.getModel()?.getValueInRange(editorRef.current.getSelection());
                          if (val) {
                            navigator.clipboard.writeText(val).catch(() => {});
                          }
                        }
                        setTextSelection(null);
                      }}
                      className="px-2.5 py-1 text-[9.5px] font-mono font-bold uppercase bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-all flex items-center space-x-1 cursor-pointer"
                    >
                      <span>Copy</span>
                    </button>
                    <button
                      onClick={() => setSelectionActionView('colors')}
                      className="px-2.5 py-1 text-[9.5px] font-mono font-bold uppercase bg-slate-800 hover:bg-slate-705 text-slate-200 rounded-lg border border-slate-700 transition-all flex items-center space-x-1 cursor-pointer"
                    >
                      <span>Color/Highlight</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setSelectionActionView('menu')}
                      className="p-1 px-2 rounded font-semibold text-[9px] font-mono bg-slate-850 hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition-colors cursor-pointer border border-slate-800"
                    >
                      ← Back
                    </button>
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-300">
                      Highlight:
                    </span>
                    <div className="flex items-center space-x-2">
                      {[
                        { id: 'yellow', bg: 'bg-yellow-400 hover:scale-125 border border-yellow-500/30' },
                        { id: 'amber', bg: 'bg-amber-500 hover:scale-125 border border-amber-600/30' },
                        { id: 'emerald', bg: 'bg-emerald-500 hover:scale-125 border border-emerald-600/30' },
                        { id: 'sky', bg: 'bg-sky-400 hover:scale-125 border border-sky-500/30' },
                        { id: 'fuchsia', bg: 'bg-fuchsia-500 hover:scale-125 border border-fuchsia-600/30' },
                        { id: 'rose', bg: 'bg-rose-500 hover:scale-125 border border-rose-600/30' }
                      ].map(color => (
                        <button
                          key={color.id}
                          onClick={() => handleApplySelectionHighlight(color.id)}
                          className={`w-4 h-4 rounded-full cursor-pointer transition-transform ${color.bg}`}
                          title={`Highlight statements as ${color.id}`}
                        />
                      ))}
                      <button
                        onClick={() => handleApplySelectionHighlight(null)}
                        className="px-2 py-0.5 rounded text-[9.5px] font-mono font-semibold hover:bg-red-500/20 text-red-400 transition-colors uppercase cursor-pointer border border-red-500/20"
                        title="Clear Highlighting"
                      >
                        Clear
                      </button>
                    </div>
                  </>
                )}
                <button
                  onClick={() => setTextSelection(null)}
                  className="p-1 rounded text-slate-455 hover:text-slate-100 cursor-pointer"
                  title="Close Selection Menu"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT SPLIT FILE PANE */}
        {isSplitActive && (
          <div className="flex-1 h-full min-h-[300px] lg:min-h-0 relative flex flex-col border-r border-slate-500/10">
            {!splitFileId ? (
              <div className={`p-4 flex-grow overflow-y-auto ${isLightTheme ? 'bg-slate-100 text-slate-800' : 'bg-[#1b1b1c] text-slate-300'}`}>
                <h3 className="text-xs font-mono uppercase tracking-wider mb-2 text-blue-400">Select File to Load Side-by-Side</h3>
                <p className="text-[11px] opacity-65 mb-4">Click any file below to mount it on the right split screen pane instantly.</p>
                <div className="flex flex-col gap-2">
                  {files.filter(f => f._id !== activeFile._id).map(f => (
                    <button
                      key={f._id}
                      onClick={() => {
                        setSplitFileId(f._id);
                        setSplitEditorValue(f.content);
                        setSplitLanguage(f.language);
                      }}
                      className={`p-2.5 rounded border text-left text-xs font-mono transition-colors ${
                        isLightTheme ? 'bg-white border-slate-200 hover:bg-slate-50' : 'bg-[#252526] border-slate-800 hover:bg-[#2d2d2e]'
                      }`}
                    >
                      📝 {f.name} <span className="opacity-40 text-[10px]">({f.language})</span>
                    </button>
                  ))}
                  {files.filter(f => f._id !== activeFile._id).length === 0 && (
                    <div className="text-[10px] font-mono opacity-50 py-4">No secondary files are available. Create folders/files first.</div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-grow flex flex-col h-full overflow-hidden">
                <div className={`p-1.5 px-3 border-b flex justify-between items-center text-[10.5px] font-mono ${
                  isLightTheme ? 'bg-slate-105 border-slate-200 text-slate-700' : 'bg-[#151515] border-[#222] text-slate-400'
                }`}>
                  <span className="text-amber-400 font-bold truncate max-w-[150px]">
                    RIGHT: {files.find(f => f._id === splitFileId)?.name || 'Editor'}
                  </span>
                  
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => {
                        if (window.confirm('Overwrite Right split file content with Left file content?')) {
                          setSplitEditorValue(editorValue);
                          setSplitIsDirty(true);
                        }
                      }}
                      className="p-1 px-1.5 hover:bg-slate-500/10 rounded text-[9.5px] uppercase font-bold text-slate-400 hover:text-slate-200"
                      title="Copy left editor content to right"
                    >
                      ← Copy Left
                    </button>

                    <button
                      onClick={() => setSplitIsEditMode(!splitIsEditMode)}
                      className="p-1 text-[9.5px] px-1 hover:bg-slate-500/10 rounded uppercase font-bold"
                    >
                      {splitIsEditMode ? '🔓 Edit' : '🔒 View'}
                    </button>

                    <button
                      onClick={async () => {
                        try {
                          const res = await onPrettifyFile(splitFileId, splitEditorValue);
                          setSplitEditorValue(res);
                          await onSaveFile(splitFileId, res);
                        } catch {
                          await onSaveFile(splitFileId, splitEditorValue);
                        }
                        setSplitIsDirty(false);
                      }}
                      className={`p-1 px-1.5 rounded transition-all text-[9.5px] uppercase font-bold ${
                        splitIsDirty ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'text-slate-400 hover:text-slate-300'
                      }`}
                    >
                      💾 Save
                    </button>

                    <button
                      onClick={() => setSplitFileId(null)}
                      className="p-1 hover:bg-slate-500/15 rounded text-red-400 text-[10px]"
                    >
                      Close
                    </button>
                  </div>
                </div>

                <div className="flex-grow h-full relative">
                  <Editor
                    height="100%"
                    language={splitLanguage}
                    value={splitEditorValue}
                    onChange={(val) => {
                      if (val === undefined) return;
                      setSplitEditorValue(val);
                      setSplitIsDirty(true);
                    }}
                    theme={isLightTheme ? 'vs' : 'vs-dark'}
                    options={{
                      readOnly: !splitIsEditMode,
                      lineNumbers: 'on',
                      minimap: { enabled: false },
                      wordWrap: 'on',
                      fontSize: fontSize,
                      tabSize: 2,
                      scrollBeyondLastLine: false,
                      automaticLayout: true,
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Dynamic Interactive Side Annotations Section */}
        {isNotesPanelOpen && (
          <div className={`w-full lg:w-80 border-t lg:border-t-0 lg:border-l flex flex-col h-1/3 lg:h-full select-none ${
            isLightTheme ? 'bg-slate-50 border-slate-200' : 'bg-[#1e1e1e] border-slate-800'
          }`}>
            {/* Section banner */}
            <div className="p-3 border-b flex items-center justify-between">
              <span className="text-xs font-semibold font-mono tracking-widest uppercase flex items-center space-x-1.5 text-blue-400">
                <Bookmark className="w-3.5 h-3.5" />
                <span>Line Notes & Highlights</span>
              </span>
              <div className="flex items-center space-x-2">
                <span className="text-[9px] font-mono opacity-50 hidden sm:inline">Saved to MongoDB</span>
                <button
                  onClick={() => setIsNotesPanelOpen(false)}
                  className="p-1 rounded hover:bg-slate-500/15 text-slate-400 hover:text-red-400 cursor-pointer"
                  title="Close notes panel view"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

          {/* Form when adding annotation on a line */}
          {activeAnnoLine !== null && (
            <div className={`p-3 border-b space-y-2.5 ${isLightTheme ? 'bg-slate-200/50' : 'bg-[#2d2d2d]'}`}>
              <div className="flex justify-between items-center text-xs">
                <span className="font-mono font-bold text-amber-500">Decorate Line #{activeAnnoLine}</span>
                <button onClick={() => setActiveAnnoLine(null)} className="text-slate-400 hover:text-slate-200">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Highlight Option */}
              <div className="flex items-center space-x-3 text-xs">
                <span className="font-mono opacity-70">Highlight:</span>
                <button
                  onClick={() => setNewAnnoColor('yellow')}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                    newAnnoColor === 'yellow' ? 'bg-yellow-500/20 border-yellow-500 text-yellow-500 font-bold' : 'border-slate-700 text-slate-400'
                  }`}
                >
                  Yellow
                </button>
                <button
                  onClick={() => setNewAnnoColor('orange')}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                    newAnnoColor === 'orange' ? 'bg-orange-500/20 border-orange-500 text-orange-500 font-bold' : 'border-slate-700 text-slate-400'
                  }`}
                >
                  Orange
                </button>
                <button
                  onClick={() => setNewAnnoColor(null)}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                    newAnnoColor === null ? 'bg-slate-500/25 border-slate-500 text-slate-300 font-bold' : 'border-slate-700 text-slate-400'
                  }`}
                >
                  None
                </button>
              </div>

              <textarea
                value={newAnnoNote}
                onChange={e => setNewAnnoNote(e.target.value)}
                placeholder="Write custom personal note about this statement..."
                className={`w-full p-2 text-xs rounded-md border outline-none font-sans scrollbar-none focus:border-blue-500 ${
                  isLightTheme ? 'bg-white border-slate-355 text-slate-800' : 'bg-[#151515] border-slate-700 text-slate-200'
                }`}
                rows={2}
              />

              <button
                id="save-line-annotation-btn"
                onClick={handleSaveAnnotation}
                className="w-full py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-semibold tracking-wide transition-colors"
              >
                Apply Annotation Properties
              </button>
            </div>
          )}

          {/* Existing annotations entries list */}
          <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
            {annotations.length === 0 ? (
              <div className="text-center py-8 opacity-50 text-[10px] font-mono leading-relaxed px-4">
                No custom annotations drawn yet. Click on any line number inside the editor margins to highlight statements or attach notes.
              </div>
            ) : (
              annotations.map(a => (
                <div
                  key={a.lineNumber}
                  className={`p-2.5 rounded-lg border text-left flex flex-col space-y-1 bg-[#232324]/40 hover:bg-[#2e2e2f]/50 transition-colors ${
                    a.highlightColor === 'yellow'
                      ? 'border-yellow-500/30 shadow-[inset_3px_0_0_0_#eab308]'
                      : a.highlightColor === 'orange'
                        ? 'border-orange-500/30 shadow-[inset_3px_0_0_0_#f97316]'
                        : 'border-slate-500/10'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      onClick={() => {
                        editorRef.current?.revealLineInCenter(a.lineNumber);
                        editorRef.current?.setPosition({ lineNumber: a.lineNumber, column: 1 });
                        editorRef.current?.focus();
                      }}
                      className="text-[10px] font-mono font-bold text-blue-400 hover:underline cursor-pointer"
                    >
                      Line #{a.lineNumber}
                    </span>
                    <button
                      onClick={() => handleDeleteAnnotation(a.lineNumber)}
                      className="text-slate-400 hover:text-red-400 p-0.5 rounded"
                      title="Erase Note highlight"
                    >
                      <Trash className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className={`text-[11px] leading-relaxed break-words font-sans selection:bg-slate-500/20 ${isLightTheme ? 'text-slate-700' : 'text-slate-300'}`}>
                    {a.note || '(Highlight marker only)'}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
        )}
      </div>

      {/* Editor Footer Status Bar */}
      {isBottomBarOpen && (
        <div className={`p-1.5 px-3 border-t text-[10px] font-mono flex flex-wrap items-center justify-between gap-2 shrink-0 ${
          isLightTheme ? 'bg-slate-100 text-slate-500 border-slate-200' : 'bg-[#007acc] text-blue-50 border-blue-900/40'
        }`}>
          <div className="flex items-center space-x-3.5">
            <span className="font-semibold uppercase tracking-wider">{activeFile.language}</span>
            <span className="opacity-75">UTF-8 Encoding</span>
            <button
              onClick={handleDeleteActiveLine}
              className="p-0.5 px-1 bg-red-600/10 text-red-100 rounded border border-red-500/20 hover:bg-red-600 hover:text-white transition-colors"
              title="Erase active statement line"
            >
              Erase Active Line
            </button>
          </div>
          <div className="flex items-center space-x-3.5">
            <span>Pos: Ln {cursorPos.line}, Col {cursorPos.col}</span>
            <span>Buffer: {editorValue.length} chars</span>
          </div>
        </div>
      )}
    </div>
  );
}
