export interface User {
  id: string;
  username: string;
}

export interface Folder {
  _id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
  isDeleted: boolean;
}

export interface FileItem {
  _id: string;
  name: string;
  content: string;
  language: string;
  path: string;
  folderId: string | null;
  createdAt: string;
  updatedAt: string;
  isDeleted: boolean;
}

export interface Tab {
  fileId: string;
  name: string;
  isDirty: boolean;
}

export interface LineAnnotation {
  _id?: string;
  fileId: string;
  lineNumber: number;
  note: string;
  highlightColor: string | null; // 'yellow' | 'orange' | null
  createdAt?: string;
  updatedAt?: string;
}

export interface SearchResult {
  fileId: string;
  fileName: string;
  path: string;
  lineNumber: number;
  lineText: string;
  matchType: 'filename' | 'content';
}

export interface KeyboardShortcut {
  keys: string;
  description: string;
}

export interface Snippet {
  _id: string;
  name: string;
  content: string;
  language: string;
  createdAt?: string;
  updatedAt?: string;
}
