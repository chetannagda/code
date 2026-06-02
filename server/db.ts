import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';

const DATA_DIR = process.env.VERCEL ? '/tmp/codevault-data' : path.join(process.cwd(), 'data');
const JSON_DB_PATH = path.join(DATA_DIR, 'db.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Interfaces
export interface IUser {
  _id: string;
  username: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IFolder {
  _id: string;
  name: string;
  parentId: string | null; // null for root files
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean; // For soft delete
}

export interface IFile {
  _id: string;
  name: string;
  content: string;
  language: string;
  path: string; // complete relative path from root
  folderId: string | null; // null if in top-level directory
  createdAt: Date;
  updatedAt: Date;
  isDeleted: boolean; // For soft delete
}

export interface ILineAnnotation {
  _id: string;
  fileId: string;
  lineNumber: number;
  note: string;
  highlightColor: string | null; // 'yellow', 'orange', or null
  createdAt: Date;
  updatedAt: Date;
}

export interface ISnippet {
  _id: string;
  name: string;
  content: string;
  language: string;
  createdAt: Date;
  updatedAt: Date;
}

// In-Memory Fallback State (if MongoDB is not available)
interface LocalSchema {
  users: IUser[];
  folders: IFolder[];
  files: IFile[];
  lineAnnotations: ILineAnnotation[];
  snippets: ISnippet[];
}

let localDb: LocalSchema = {
  users: [],
  folders: [],
  files: [],
  lineAnnotations: [],
  snippets: [],
};

// Load database if it exists
function loadLocalDb() {
  try {
    if (fs.existsSync(JSON_DB_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(JSON_DB_PATH, 'utf-8'));
      localDb = {
        users: (parsed.users || []).map((u: any) => ({ ...u, createdAt: new Date(u.createdAt), updatedAt: new Date(u.updatedAt) })),
        folders: (parsed.folders || []).map((f: any) => ({ ...f, createdAt: new Date(f.createdAt), updatedAt: new Date(f.updatedAt) })),
        files: (parsed.files || []).map((f: any) => ({ ...f, createdAt: new Date(f.createdAt), updatedAt: new Date(f.updatedAt) })),
        lineAnnotations: (parsed.lineAnnotations || []).map((la: any) => ({ ...la, createdAt: new Date(la.createdAt), updatedAt: new Date(la.updatedAt) })),
        snippets: (parsed.snippets || []).map((s: any) => ({ ...s, createdAt: new Date(s.createdAt), updatedAt: new Date(s.updatedAt) })),
      };
    } else {
      saveLocalDb();
    }
  } catch (error) {
    console.error('Error loading JSON DB fallback:', error);
  }
}

function saveLocalDb() {
  try {
    fs.writeFileSync(JSON_DB_PATH, JSON.stringify(localDb, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error saving JSON DB fallback:', error);
  }
}

// Generate IDs resembling MongoDB ObjectIds
function generateId() {
  return Array.from({ length: 24 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

// Handle dual connectivity: Mongoose vs File-based persistence
let isMongooseConnected = false;

// Mongoose Schemas (if MONGODB_URI is provided)
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
}, { timestamps: true });

const FolderSchema = new mongoose.Schema({
  name: { type: String, required: true },
  parentId: { type: String, default: null },
  isDeleted: { type: Boolean, default: false },
}, { timestamps: true });

const FileSchema = new mongoose.Schema({
  name: { type: String, required: true },
  content: { type: String, default: '' },
  language: { type: String, default: 'plaintext' },
  path: { type: String, required: true },
  folderId: { type: String, default: null },
  isDeleted: { type: Boolean, default: false },
}, { timestamps: true });

const LineAnnotationSchema = new mongoose.Schema({
  fileId: { type: String, required: true },
  lineNumber: { type: Number, required: true },
  note: { type: String, default: '' },
  highlightColor: { type: String, default: null },
}, { timestamps: true });

const SnippetSchema = new mongoose.Schema({
  name: { type: String, required: true },
  content: { type: String, required: true },
  language: { type: String, default: 'plaintext' },
}, { timestamps: true });

let MongoUserModel: any;
let MongoFolderModel: any;
let MongoFileModel: any;
let MongoLineAnnotationModel: any;
let MongoSnippetModel: any;

export async function connectToDatabase() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.log('MONGODB_URI not provided. Running CodeVault on Local File System JSON DB Engine.');
    loadLocalDb();
    return;
  }

  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
    isMongooseConnected = true;
    console.log('Successfully connected to MongoDB.');

    // Initialize Mongoose Models
    MongoUserModel = mongoose.model('User', UserSchema);
    MongoFolderModel = mongoose.model('Folder', FolderSchema);
    MongoFileModel = mongoose.model('File', FileSchema);
    MongoLineAnnotationModel = mongoose.model('LineAnnotation', LineAnnotationSchema);
    MongoSnippetModel = mongoose.model('Snippet', SnippetSchema);
  } catch (err) {
    console.warn('Failed to connect to MongoDB, using Local JSON DB backup:', err);
    loadLocalDb();
  }
}

// Database Actions Interface
export const db = {
  getIsMongoose() {
    return isMongooseConnected;
  },

  // USERS
  users: {
    async findOne(filter: { username?: string; _id?: string }): Promise<IUser | null> {
      if (isMongooseConnected) {
        const u = await MongoUserModel.findOne(filter).exec();
        if (!u) return null;
        return { _id: u._id.toString(), username: u.username, passwordHash: u.passwordHash, createdAt: u.createdAt, updatedAt: u.updatedAt };
      }
      loadLocalDb();
      const user = localDb.users.find(u => {
        if (filter.username !== undefined && u.username.toLowerCase() !== filter.username.toLowerCase()) return false;
        if (filter._id !== undefined && u._id !== filter._id) return false;
        return true;
      });
      return user || null;
    },

    async create(data: { username: string; passwordHash: string }): Promise<IUser> {
      if (isMongooseConnected) {
        const u = await MongoUserModel.create(data);
        return { _id: u._id.toString(), username: u.username, passwordHash: u.passwordHash, createdAt: u.createdAt, updatedAt: u.updatedAt };
      }
      loadLocalDb();
      const newUser: IUser = {
        _id: generateId(),
        username: data.username,
        passwordHash: data.passwordHash,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      localDb.users.push(newUser);
      saveLocalDb();
      return newUser;
    },

    async count(): Promise<number> {
      if (isMongooseConnected) {
        return await MongoUserModel.countDocuments().exec();
      }
      loadLocalDb();
      return localDb.users.length;
    }
  },

  // FOLDERS
  folders: {
    async find(filter: Partial<IFolder> = {}): Promise<IFolder[]> {
      if (isMongooseConnected) {
        const mFilters: any = {};
        if (filter.parentId !== undefined) mFilters.parentId = filter.parentId;
        if (filter.isDeleted !== undefined) mFilters.isDeleted = filter.isDeleted;
        const list = await MongoFolderModel.find(mFilters).exec();
        return list.map((f: any) => ({
          _id: f._id.toString(),
          name: f.name,
          parentId: f.parentId,
          isDeleted: f.isDeleted,
          createdAt: f.createdAt,
          updatedAt: f.updatedAt
        }));
      }
      loadLocalDb();
      return localDb.folders.filter(f => {
        if (filter.parentId !== undefined && f.parentId !== filter.parentId) return false;
        if (filter.isDeleted !== undefined && f.isDeleted !== filter.isDeleted) return false;
        return true;
      });
    },

    async findById(id: string): Promise<IFolder | null> {
      if (isMongooseConnected) {
        const f = await MongoFolderModel.findById(id).exec();
        if (!f) return null;
        return { _id: f._id.toString(), name: f.name, parentId: f.parentId, isDeleted: f.isDeleted, createdAt: f.createdAt, updatedAt: f.updatedAt };
      }
      loadLocalDb();
      return localDb.folders.find(f => f._id === id) || null;
    },

    async create(data: { name: string; parentId: string | null }): Promise<IFolder> {
      if (isMongooseConnected) {
        const f = await MongoFolderModel.create({ name: data.name, parentId: data.parentId, isDeleted: false });
        return {
          _id: f._id.toString(),
          name: f.name,
          parentId: f.parentId,
          isDeleted: f.isDeleted,
          createdAt: f.createdAt,
          updatedAt: f.updatedAt
        };
      }
      loadLocalDb();
      const newFolder: IFolder = {
        _id: generateId(),
        name: data.name,
        parentId: data.parentId,
        createdAt: new Date(),
        updatedAt: new Date(),
        isDeleted: false,
      };
      localDb.folders.push(newFolder);
      saveLocalDb();
      return newFolder;
    },

    async update(id: string, updates: Partial<IFolder>): Promise<IFolder | null> {
      if (isMongooseConnected) {
        const f = await MongoFolderModel.findByIdAndUpdate(id, updates, { new: true }).exec();
        if (!f) return null;
        return { _id: f._id.toString(), name: f.name, parentId: f.parentId, isDeleted: f.isDeleted, createdAt: f.createdAt, updatedAt: f.updatedAt };
      }
      loadLocalDb();
      const fIdx = localDb.folders.findIndex(f => f._id === id);
      if (fIdx === -1) return null;
      localDb.folders[fIdx] = {
        ...localDb.folders[fIdx],
        ...updates,
        updatedAt: new Date()
      };
      saveLocalDb();
      return localDb.folders[fIdx];
    },

    async deletePermanently(id: string): Promise<boolean> {
      if (isMongooseConnected) {
        const res = await MongoFolderModel.findByIdAndDelete(id).exec();
        return !!res;
      }
      loadLocalDb();
      const initialLen = localDb.folders.length;
      localDb.folders = localDb.folders.filter(f => f._id !== id);
      saveLocalDb();
      return localDb.folders.length < initialLen;
    }
  },

  // FILES
  files: {
    async find(filter: Partial<IFile> = {}): Promise<IFile[]> {
      if (isMongooseConnected) {
        const mFilters: any = {};
        if (filter.folderId !== undefined) mFilters.folderId = filter.folderId;
        if (filter.isDeleted !== undefined) mFilters.isDeleted = filter.isDeleted;
        const list = await MongoFileModel.find(mFilters).exec();
        return list.map((f: any) => ({
          _id: f._id.toString(),
          name: f.name,
          content: f.content,
          language: f.language,
          path: f.path,
          folderId: f.folderId,
          isDeleted: f.isDeleted,
          createdAt: f.createdAt,
          updatedAt: f.updatedAt
        }));
      }
      loadLocalDb();
      return localDb.files.filter(f => {
        if (filter.folderId !== undefined && f.folderId !== filter.folderId) return false;
        if (filter.isDeleted !== undefined && f.isDeleted !== filter.isDeleted) return false;
        return true;
      });
    },

    async findAllIncludingDeleted(): Promise<IFile[]> {
      if (isMongooseConnected) {
        const list = await MongoFileModel.find({}).exec();
        return list.map((f: any) => ({
          _id: f._id.toString(),
          name: f.name,
          content: f.content,
          language: f.language,
          path: f.path,
          folderId: f.folderId,
          isDeleted: f.isDeleted,
          createdAt: f.createdAt,
          updatedAt: f.updatedAt
        }));
      }
      loadLocalDb();
      return [...localDb.files];
    },

    async findById(id: string): Promise<IFile | null> {
      if (isMongooseConnected) {
        const f = await MongoFileModel.findById(id).exec();
        if (!f) return null;
        return {
          _id: f._id.toString(),
          name: f.name,
          content: f.content,
          language: f.language,
          path: f.path,
          folderId: f.folderId,
          isDeleted: f.isDeleted,
          createdAt: f.createdAt,
          updatedAt: f.updatedAt
        };
      }
      loadLocalDb();
      return localDb.files.find(f => f._id === id) || null;
    },

    async create(data: { name: string; content: string; language: string; path: string; folderId: string | null }): Promise<IFile> {
      if (isMongooseConnected) {
        const f = await MongoFileModel.create({ ...data, isDeleted: false });
        return {
          _id: f._id.toString(),
          name: f.name,
          content: f.content,
          language: f.language,
          path: f.path,
          folderId: f.folderId,
          isDeleted: f.isDeleted,
          createdAt: f.createdAt,
          updatedAt: f.updatedAt
        };
      }
      loadLocalDb();
      const newFile: IFile = {
        ...data,
        _id: generateId(),
        createdAt: new Date(),
        updatedAt: new Date(),
        isDeleted: false,
      };
      localDb.files.push(newFile);
      saveLocalDb();
      return newFile;
    },

    async update(id: string, updates: Partial<IFile>): Promise<IFile | null> {
      if (isMongooseConnected) {
        const f = await MongoFileModel.findByIdAndUpdate(id, updates, { new: true }).exec();
        if (!f) return null;
        return {
          _id: f._id.toString(),
          name: f.name,
          content: f.content,
          language: f.language,
          path: f.path,
          folderId: f.folderId,
          isDeleted: f.isDeleted,
          createdAt: f.createdAt,
          updatedAt: f.updatedAt
        };
      }
      loadLocalDb();
      const fIdx = localDb.files.findIndex(f => f._id === id);
      if (fIdx === -1) return null;
      localDb.files[fIdx] = {
        ...localDb.files[fIdx],
        ...updates,
        updatedAt: new Date()
      };
      saveLocalDb();
      return localDb.files[fIdx];
    },

    async deletePermanently(id: string): Promise<boolean> {
      if (isMongooseConnected) {
        const res = await MongoFileModel.findByIdAndDelete(id).exec();
        return !!res;
      }
      loadLocalDb();
      const initialLen = localDb.files.length;
      localDb.files = localDb.files.filter(f => f._id !== id);
      saveLocalDb();
      return localDb.files.length < initialLen;
    }
  },

  // LINE ANNOTATIONS
  lineAnnotations: {
    async findByFile(fileId: string): Promise<ILineAnnotation[]> {
      if (isMongooseConnected) {
        const list = await MongoLineAnnotationModel.find({ fileId }).exec();
        return list.map((la: any) => ({
          _id: la._id.toString(),
          fileId: la.fileId,
          lineNumber: la.lineNumber,
          note: la.note,
          highlightColor: la.highlightColor,
          createdAt: la.createdAt,
          updatedAt: la.updatedAt
        }));
      }
      loadLocalDb();
      return localDb.lineAnnotations.filter(la => la.fileId === fileId);
    },

    async upsert(fileId: string, lineNumber: number, updates: { note?: string; highlightColor?: string | null }): Promise<ILineAnnotation> {
      if (isMongooseConnected) {
        const la = await MongoLineAnnotationModel.findOneAndUpdate(
          { fileId, lineNumber },
          { $set: updates },
          { new: true, upsert: true }
        ).exec();
        return {
          _id: la._id.toString(),
          fileId: la.fileId,
          lineNumber: la.lineNumber,
          note: la.note,
          highlightColor: la.highlightColor,
          createdAt: la.createdAt,
          updatedAt: la.updatedAt
        };
      }
      loadLocalDb();
      let la = localDb.lineAnnotations.find(item => item.fileId === fileId && item.lineNumber === lineNumber);
      if (la) {
        if (updates.note !== undefined) la.note = updates.note;
        if (updates.highlightColor !== undefined) la.highlightColor = updates.highlightColor;
        la.updatedAt = new Date();
      } else {
        la = {
          _id: generateId(),
          fileId,
          lineNumber,
          note: updates.note || '',
          highlightColor: updates.highlightColor || null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        localDb.lineAnnotations.push(la);
      }
      saveLocalDb();
      return la;
    },

    async remove(fileId: string, lineNumber: number): Promise<boolean> {
      if (isMongooseConnected) {
        const res = await MongoLineAnnotationModel.deleteOne({ fileId, lineNumber }).exec();
        return res.deletedCount > 0;
      }
      loadLocalDb();
      const initLen = localDb.lineAnnotations.length;
      localDb.lineAnnotations = localDb.lineAnnotations.filter(item => !(item.fileId === fileId && item.lineNumber === lineNumber));
      saveLocalDb();
      return localDb.lineAnnotations.length < initLen;
    },

    async removeAllForFile(fileId: string): Promise<void> {
      if (isMongooseConnected) {
        await MongoLineAnnotationModel.deleteMany({ fileId }).exec();
        return;
      }
      loadLocalDb();
      localDb.lineAnnotations = localDb.lineAnnotations.filter(item => item.fileId !== fileId);
      saveLocalDb();
    }
  },

  // CODE SNIPPETS
  snippets: {
    async find(search?: string): Promise<ISnippet[]> {
      if (isMongooseConnected) {
        const query = search ? { name: { $regex: search, $options: 'i' } } : {};
        const list = await MongoSnippetModel.find(query).sort({ updatedAt: -1 }).exec();
        return list.map((s: any) => ({
          _id: s._id.toString(),
          name: s.name,
          content: s.content,
          language: s.language,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
        }));
      }
      loadLocalDb();
      let list = [...localDb.snippets];
      if (search) {
        const lower = search.toLowerCase();
        list = list.filter(s => s.name.toLowerCase().includes(lower));
      }
      return list.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    },

    async create(data: { name: string; content: string; language: string }): Promise<ISnippet> {
      if (isMongooseConnected) {
        const s = await MongoSnippetModel.create(data);
        return {
          _id: s._id.toString(),
          name: s.name,
          content: s.content,
          language: s.language,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
        };
      }
      loadLocalDb();
      const newSnip: ISnippet = {
        _id: generateId(),
        name: data.name,
        content: data.content,
        language: data.language,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      localDb.snippets.push(newSnip);
      saveLocalDb();
      return newSnip;
    },

    async remove(id: string): Promise<boolean> {
      if (isMongooseConnected) {
        const res = await MongoSnippetModel.findByIdAndDelete(id).exec();
        return !!res;
      }
      loadLocalDb();
      const initLen = localDb.snippets.length;
      localDb.snippets = localDb.snippets.filter(s => s._id !== id);
      saveLocalDb();
      return localDb.snippets.length < initLen;
    }
  }
};
