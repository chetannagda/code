import React from 'react';
import { X, Keyboard, Command } from 'lucide-react';

interface ShortcutsModalProps {
  onClose: () => void;
  isLightTheme: boolean;
}

export default function ShortcutsModal({ onClose, isLightTheme }: ShortcutsModalProps) {
  const shortcuts = [
    { keys: ['Ctrl', 'S'], description: 'Format & Save active file' },
    { keys: ['Ctrl', 'K'], description: 'Toggle keyboard shortcuts menu' },
    { keys: ['Ctrl', '/'], description: 'Comment / Uncomment selected line' },
    { keys: ['Ctrl', 'H'], description: 'Open find and replace interface' },
    { keys: ['Click Line #'], description: 'Highlight line & append custom line notes' },
    { keys: ['Right Click'], description: 'Open Context Options (Create, Delete, Copy, Paste)' },
    { keys: ['Drag CodeItem'], description: 'Re-organize files/folders in nested groups' },
  ];

  return (
    <div id="shortcuts-modal-overlay" className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div
        className={`w-full max-w-md rounded-xl p-6 border shadow-2xl transition-all scale-100 ${
          isLightTheme ? 'bg-white border-slate-200 text-slate-800' : 'bg-[#252526] border-slate-700/60 text-slate-100'
        }`}
      >
        <div className="flex items-center justify-between border-b pb-3 mb-4 border-slate-500/10">
          <h2 className="text-sm font-semibold tracking-wide uppercase font-mono flex items-center space-x-2">
            <Keyboard className="w-4 h-4 text-blue-500" />
            <span>CodeVault Keybindings</span>
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-slate-500/10 text-slate-400 hover:text-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2.5 max-h-[300px] overflow-y-auto">
          {shortcuts.map((s, idx) => (
            <div key={idx} className="flex justify-between items-center py-2 border-b border-slate-500/10">
              <span className="text-xs">{s.description}</span>
              <div className="flex gap-1">
                {s.keys.map((k, kIdx) => (
                  <kbd
                    key={kIdx}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${
                      isLightTheme
                        ? 'bg-slate-100 border-slate-200 text-slate-700'
                        : 'bg-black/40 border-slate-700/60 text-slate-300'
                    }`}
                  >
                    {k}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 text-center flex justify-center">
          <button
            id="shortcuts-close-btn"
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-all shadow-md shadow-blue-500/10"
          >
            Dismiss Shortcuts
          </button>
        </div>
      </div>
    </div>
  );
}
