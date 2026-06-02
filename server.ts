import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import JSZip from 'jszip';
import { createServer as createViteServer } from 'vite';
import { connectToDatabase, db } from './server/db.js';

// Setup key configurations
const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'codevault-secure-session-key-2026';

// Extend Express Request type to include user info
interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    username: string;
  };
}

async function startServer() {
  // Connect to database (MongoDB or local fallback)
  await connectToDatabase();

  const app = express();

  // Enable trust proxy for upstream secure headers in environment containers
  app.set('trust proxy', true);

  // Middleware layers
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));
  app.use(cookieParser());

  // CORS or Security checks
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Credentials', 'true');
    next();
  });

  // JWT Middleware validation
  const authenticateToken = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    let token: string | undefined = undefined;

    // Prioritize Authorization Bearer Header first for maximum compatibility
    if (req.headers.authorization) {
      const authHeader = req.headers.authorization;
      if (authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    }

    // Fallback to HttpOnly cookie if header is not present
    if (!token) {
      token = req.cookies.token;
    }

    if (!token) {
      return res.status(401).json({ error: 'Session expired or unauthorized. Please log in.' });
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; username: string };
      req.user = decoded;
      next();
    } catch (err) {
      res.clearCookie('token');
      return res.status(401).json({ error: 'Invalid or expired session. Please log in.' });
    }
  };

  // --- AUTH ENDPOINTS ---

  // Check if system needs bootstrap (no user in DB)
  app.get('/api/auth/status', async (req, res) => {
    try {
      const count = await db.users.count();
      res.json({ bootstrapped: count > 0 });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Database status error' });
    }
  });

  const getCookieOptions = (req: any) => {
    // Force secure and sameSite: 'none' for maximum compatibility inside secure iframes
    return {
      httpOnly: true,
      secure: true,
      sameSite: 'none' as const,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    };
  };

  // Bootstrap single admin user
  app.post('/api/auth/bootstrap', async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required.' });
      }

      const count = await db.users.count();
      if (count > 0) {
        return res.status(400).json({ error: 'System is already bootstrapped.' });
      }

      // Hash password and create user
      const passwordHash = await bcrypt.hash(password, 10);
      const user = await db.users.create({ username, passwordHash });

      // Generate JWT and set HttpOnly Cookie
      const token = jwt.sign({ userId: user._id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
      res.cookie('token', token, getCookieOptions(req));

      res.status(201).json({ success: true, token, user: { id: user._id, username: user.username } });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Error occurred during bootstrap.' });
    }
  });

  // Normal Login
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required.' });
      }

      const user = await db.users.findOne({ username });
      if (!user) {
        return res.status(401).json({ error: 'Invalid username or password.' });
      }

      const isMatch = await bcrypt.compare(password, user.passwordHash);
      if (!isMatch) {
        return res.status(401).json({ error: 'Invalid username or password.' });
      }

      // Set cookie
      const token = jwt.sign({ userId: user._id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
      res.cookie('token', token, getCookieOptions(req));

      res.json({ success: true, token, user: { id: user._id, username: user.username } });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Login failed.' });
    }
  });

  // Logout
  app.post('/api/auth/logout', (req, res) => {
    const opts = getCookieOptions(req);
    // @ts-ignore
    delete opts.maxAge;
    res.clearCookie('token', opts);
    res.json({ success: true, message: 'Logged out successfully.' });
  });

  // Verify authentication / Fetch Me
  app.get('/api/auth/me', authenticateToken, (req: AuthenticatedRequest, res) => {
    res.json({ authenticated: true, user: req.user });
  });

  // --- CODE PRETTIFIER / FORMATTER ---
  app.post('/api/formatter/prettify', authenticateToken, (req, res) => {
    const { content, language } = req.body;
    if (content === undefined || !language) {
      return res.status(400).json({ error: 'Content and language are required.' });
    }

    try {
      let formatted = content;
      const lang = language.toLowerCase();

      if (lang === 'json') {
        try {
          formatted = JSON.stringify(JSON.parse(content), null, 2);
        } catch {
          return res.status(400).json({ error: 'Invalid JSON content.' });
        }
      } else if (lang === 'python') {
        // autopep8-style parser
        const lines = content.split('\n');
        formatted = lines
          .map((line: string) => {
            // Trim trailing whitespace
            let cleaned = line.trimEnd();
            // Standardize spaces around basic operators
            cleaned = cleaned.replace(/\s*([=+\-*/%&|^<>])\s*/g, ' $1 ');
            // Correct some extra spaces like '  =  '
            cleaned = cleaned.replace(/\s{2,}/g, ' ');
            // Make sure indentation (multiples of 4) is respected
            const matchIndex = line.search(/\S/);
            const indentSize = matchIndex > 0 ? matchIndex : 0;
            const spaces = ' '.repeat(indentSize);
            return spaces + cleaned.trim();
          })
          .join('\n')
          // Standardize end of file with a single newline
          .trim() + '\n';
      } else if (['javascript', 'typescript', 'javascriptreact', 'typescriptreact', 'jsx', 'tsx'].includes(lang)) {
        // Prettier-style formatting
        const lines = content.split('\n');
        let currentIndent = 0;
        formatted = lines
          .map((line: string) => {
            let trimmed = line.trim();
            if (trimmed.startsWith('}') || trimmed.startsWith(']')) {
              currentIndent = Math.max(0, currentIndent - 2);
            }
            const indent = ' '.repeat(currentIndent);
            let cleaned = indent + trimmed;
            if (trimmed.endsWith('{') || trimmed.endsWith('[')) {
              currentIndent += 2;
            }
            return cleaned;
          })
          .join('\n');
      } else if (lang === 'yaml' || lang === 'yml') {
        // normalize indentation
        const lines = content.split('\n');
        formatted = lines
          .map((line: string) => {
            const trimmed = line.trim();
            if (!trimmed) return '';
            // Ensure proper spaces after colons
            let cleaned = trimmed.replace(/:\s*(\S)/, ': $1');
            const matchIndex = line.search(/\S/);
            const indentSize = matchIndex > 0 ? Math.floor(matchIndex / 2) * 2 : 0;
            return ' '.repeat(indentSize) + cleaned;
          })
          .join('\n');
      } else if (lang === 'robot' || lang === 'robotframework') {
        // Robot Framework: Align keywords and arguments
        const lines = content.split('\n');
        formatted = lines
          .map((line: string) => {
            // Lines starting with *** are section headers
            if (line.trim().startsWith('***')) {
              return line.trim();
            }
            // Robot files use double-spaces or tabs as delimiters
            const parts = line.split(/\s{2,}|\t/);
            if (parts.length <= 1) {
              return line;
            }
            // First item (e.g. key) aligned nicely
            const isSetVal = parts[0].trim().startsWith('${') || parts[0].trim() === '';
            const paddedBase = isSetVal ? parts[0].trim().padEnd(20) : parts[0].trim().padEnd(30);
            const rest = parts.slice(1).map(p => p.trim()).filter(Boolean);
            return `${isSetVal ? '  ' : ''}${paddedBase}    ${rest.join('    ')}`;
          })
          .join('\n');
      }

      res.json({ formatted });
    } catch (err: any) {
      res.status(500).json({ error: 'Formatting failed: ' + err.message });
    }
  });

  // --- FILE SYSTEM API ENDPOINTS ---

  // Get File Structure
  app.get('/api/fs', authenticateToken, async (req, res) => {
    try {
      const activeFolders = await db.folders.find({ isDeleted: false });
      const activeFiles = await db.files.find({ isDeleted: false });
      res.json({ folders: activeFolders, files: activeFiles });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get Empty or Deleted Items list (Recycle Bin / Trash)
  app.get('/api/fs/trash', authenticateToken, async (req, res) => {
    try {
      const allFolders = await db.folders.find();
      const allFiles = await db.files.findAllIncludingDeleted();
      const deletedFolders = allFolders.filter(f => f.isDeleted);
      const deletedFiles = allFiles.filter(f => f.isDeleted);
      res.json({ folders: deletedFolders, files: deletedFiles });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Empty Trash Permanently
  app.post('/api/fs/trash/empty', authenticateToken, async (req, res) => {
    try {
      const allFolders = await db.folders.find();
      const allFiles = await db.files.findAllIncludingDeleted();

      const deletedFolders = allFolders.filter(f => f.isDeleted);
      const deletedFiles = allFiles.filter(f => f.isDeleted);

      for (const file of deletedFiles) {
        await db.files.deletePermanently(file._id);
        await db.lineAnnotations.removeAllForFile(file._id);
      }

      for (const folder of deletedFolders) {
        await db.folders.deletePermanently(folder._id);
      }

      res.json({ success: true, message: 'Recycle bin emptied permanently.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Restore deleted folder/file
  app.post('/api/fs/restore/:type/:id', authenticateToken, async (req, res) => {
    try {
      const { type, id } = req.params;
      if (type === 'file') {
        const file = await db.files.findById(id);
        if (!file) return res.status(404).json({ error: 'File not found' });
        await db.files.update(id, { isDeleted: false });
        res.json({ success: true, message: 'File restored.' });
      } else if (type === 'folder') {
        const folder = await db.folders.findById(id);
        if (!folder) return res.status(404).json({ error: 'Folder not found' });

        // Restore recursive folders and files
        const restoreRecursive = async (folderId: string) => {
          await db.folders.update(folderId, { isDeleted: false });
          const childFiles = await db.files.findAllIncludingDeleted();
          const itemsToRestore = childFiles.filter(f => f.folderId === folderId && f.isDeleted);
          for (const f of itemsToRestore) {
            await db.files.update(f._id, { isDeleted: false });
          }
          const childFolders = await db.folders.find();
          const subFolders = childFolders.filter(f => f.parentId === folderId && f.isDeleted);
          for (const sf of subFolders) {
            await restoreRecursive(sf._id);
          }
        };

        await restoreRecursive(id);
        res.json({ success: true, message: 'Folder and nested contents restored successfully.' });
      } else {
        res.status(400).json({ error: 'Invalid type' });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Create Folder
  app.post('/api/fs/folder', authenticateToken, async (req, res) => {
    try {
      const { name, parentId } = req.body;
      if (!name) {
        return res.status(400).json({ error: 'Folder name is required.' });
      }
      const folder = await db.folders.create({ name, parentId: parentId || null });
      res.status(201).json(folder);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Create File
  app.post('/api/fs/file', authenticateToken, async (req, res) => {
    try {
      const { name, content, language, path: filePath, folderId } = req.body;
      if (!name) {
        return res.status(400).json({ error: 'File name is required.' });
      }

      // Map file extension to Monaco language
      const ext = path.extname(name).toLowerCase();
      let lang = language || 'plaintext';
      if (!language) {
        if (ext === '.py') lang = 'python';
        else if (ext === '.robot' || ext === '.resource') lang = 'robot';
        else if (ext === '.json') lang = 'json';
        else if (ext === '.yaml' || ext === '.yml') lang = 'yaml';
        else if (ext === '.java') lang = 'java';
        else if (ext === '.go') lang = 'go';
        else if (ext === '.js') lang = 'javascript';
        else if (ext === '.ts') lang = 'typescript';
        else if (ext === '.jsx') lang = 'javascript'; // or jsx
        else if (ext === '.tsx') lang = 'typescript'; // or tsx
        else if (ext === '.md') lang = 'markdown';
      }

      const file = await db.files.create({
        name,
        content: content || '',
        language: lang,
        path: filePath || name,
        folderId: folderId || null,
      });

      res.status(201).json(file);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Update Folder (Rename or Move)
  app.put('/api/fs/folder/:id', authenticateToken, async (req, res) => {
    try {
      const { id } = req.params;
      const { name, parentId } = req.body;
      const updates: any = {};
      if (name !== undefined) updates.name = name;
      if (parentId !== undefined) updates.parentId = parentId || null;

      const updated = await db.folders.update(id, updates);
      if (!updated) {
        return res.status(404).json({ error: 'Folder not found.' });
      }
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Update File (Content, Save, Rename, Move)
  app.put('/api/fs/file/:id', authenticateToken, async (req, res) => {
    try {
      const { id } = req.params;
      const { name, content, language, path: filePath, folderId } = req.body;
      const updates: any = {};
      if (name !== undefined) updates.name = name;
      if (content !== undefined) updates.content = content;
      if (language !== undefined) updates.language = language;
      if (filePath !== undefined) updates.path = filePath;
      if (folderId !== undefined) updates.folderId = folderId || null;

      // Also dynamically update language if name changed and language was not explicitly provided
      if (name !== undefined && language === undefined) {
        const ext = path.extname(name).toLowerCase();
        if (ext === '.py') updates.language = 'python';
        else if (ext === '.robot' || ext === '.resource') updates.language = 'robot';
        else if (ext === '.json') updates.language = 'json';
        else if (ext === '.yaml' || ext === '.yml') updates.language = 'yaml';
        else if (ext === '.java') updates.language = 'java';
        else if (ext === '.go') updates.language = 'go';
        else if (ext === '.js') updates.language = 'javascript';
        else if (ext === '.ts') updates.language = 'typescript';
        else if (ext === '.jsx') updates.language = 'javascript';
        else if (ext === '.tsx') updates.language = 'typescript';
        else if (ext === '.md') updates.language = 'markdown';
      }

      const updated = await db.files.update(id, updates);
      if (!updated) {
        return res.status(404).json({ error: 'File not found.' });
      }
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Delete Folder (Soft delete)
  app.delete('/api/fs/folder/:id', authenticateToken, async (req, res) => {
    try {
      const { id } = req.params;
      const { permanent } = req.query;

      if (permanent === 'true') {
        const deleted = await db.folders.deletePermanently(id);
        return res.json({ success: deleted });
      }

      // Soft delete recursively
      const softDeleteRecursive = async (folderId: string) => {
        await db.folders.update(folderId, { isDeleted: true });
        const allFiles = await db.files.findAllIncludingDeleted();
        const activeFiles = allFiles.filter(f => f.folderId === folderId && !f.isDeleted);
        for (const f of activeFiles) {
          await db.files.update(f._id, { isDeleted: true });
        }
        const childFolders = await db.folders.find({ isDeleted: false });
        const activeSubFolders = childFolders.filter(f => f.parentId === folderId);
        for (const sf of activeSubFolders) {
          await softDeleteRecursive(sf._id);
        }
      };

      await softDeleteRecursive(id);
      res.json({ success: true, message: 'Folder soft-deleted.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Delete File (Soft delete)
  app.delete('/api/fs/file/:id', authenticateToken, async (req, res) => {
    try {
      const { id } = req.params;
      const { permanent } = req.query;

      if (permanent === 'true') {
        const deleted = await db.files.deletePermanently(id);
        await db.lineAnnotations.removeAllForFile(id);
        return res.json({ success: deleted });
      }

      const updated = await db.files.update(id, { isDeleted: true });
      if (!updated) {
        return res.status(404).json({ error: 'File not found.' });
      }
      res.json({ success: true, message: 'File soft-deleted.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- ZIP UPLOAD AND PARSE ---
  // Expects a multipart file or direct binary upload/base64 payload
  app.post('/api/fs/zip', authenticateToken, async (req, res) => {
    try {
      const { zipBase64, parentFolderId } = req.body;
      if (!zipBase64) {
        return res.status(400).json({ error: 'zipBase64 string payload is required.' });
      }

      const zip = new JSZip();
      const zipData = await zip.loadAsync(zipBase64, { base64: true });

      // Track mapped folder structures dynamically during parsing
      const folderMap = new Map<string, string>(); // ZipPath -> DB ObjectID String
      let filesCreatedCount = 0;
      let foldersCreatedCount = 0;

      // Filter and sort items to ensure folders are processed before files
      const paths = Object.keys(zipData.files).sort((a, b) => a.localeCompare(b));

      for (const p of paths) {
        const zipEntry = zipData.files[p];
        if (zipEntry.dir) {
          // Folder creation
          const relativePath = p.replace(/\/$/, ''); // sanitize trailing slash
          const folderParts = relativePath.split('/');
          const folderName = folderParts[folderParts.length - 1];

          // Determine parent id
          let dbParentId = parentFolderId || null;
          if (folderParts.length > 1) {
            const parentRelativePath = folderParts.slice(0, -1).join('/');
            dbParentId = folderMap.get(parentRelativePath) || parentFolderId || null;
          }

          const dbFolder = await db.folders.create({ name: folderName, parentId: dbParentId });
          folderMap.set(relativePath, dbFolder._id);
          foldersCreatedCount++;
        } else {
          // File creation
          const fileParts = p.split('/');
          const fileName = fileParts[fileParts.length - 1];

          // Determine parent folder id
          let dbParentFolderId = parentFolderId || null;
          if (fileParts.length > 1) {
            const parentRelativePath = fileParts.slice(0, -1).join('/');
            dbParentFolderId = folderMap.get(parentRelativePath) || parentFolderId || null;
          }

          const fileContent = await zipEntry.async('string');

          // Language matching
          const ext = path.extname(fileName).toLowerCase();
          let lang = 'plaintext';
          if (ext === '.py') lang = 'python';
          else if (ext === '.robot' || ext === '.resource') lang = 'robot';
          else if (ext === '.json') lang = 'json';
          else if (ext === '.yaml' || ext === '.yml') lang = 'yaml';
          else if (ext === '.java') lang = 'java';
          else if (ext === '.go') lang = 'go';
          else if (ext === '.js') lang = 'javascript';
          else if (ext === '.ts') lang = 'typescript';
          else if (ext === '.jsx') lang = 'javascript';
          else if (ext === '.tsx') lang = 'typescript';
          else if (ext === '.md') lang = 'markdown';

          await db.files.create({
            name: fileName,
            content: fileContent,
            language: lang,
            path: p,
            folderId: dbParentFolderId,
          });
          filesCreatedCount++;
        }
      }

      res.status(201).json({
        success: true,
        message: `Extracted successfully! Created ${foldersCreatedCount} folders and ${filesCreatedCount} files.`,
      });
    } catch (err: any) {
      res.status(500).json({ error: 'ZIP extraction failed: ' + err.message });
    }
  });

  // --- GLOBAL CODE SEARCH ---
  app.get('/api/search', authenticateToken, async (req, res) => {
    try {
      const { q } = req.query;
      if (!q || typeof q !== 'string') {
        return res.status(400).json({ error: 'Search query parameter (q) is required.' });
      }

      const activeFiles = await db.files.find({ isDeleted: false });
      const queryLower = q.toLowerCase();
      const results: Array<{
        fileId: string;
        fileName: string;
        path: string;
        lineNumber: number;
        lineText: string;
        matchType: 'filename' | 'content';
      }> = [];

      for (const file of activeFiles) {
        // Match in filename
        if (file.name.toLowerCase().includes(queryLower)) {
          results.push({
            fileId: file._id,
            fileName: file.name,
            path: file.path,
            lineNumber: 1,
            lineText: `(Filename Match: ${file.name})`,
            matchType: 'filename',
          });
        }

        // Match in content line by line
        const lines = file.content.split('\n');
        lines.forEach((lineText, idx) => {
          if (lineText.toLowerCase().includes(queryLower)) {
            results.push({
              fileId: file._id,
              fileName: file.name,
              path: file.path,
              lineNumber: idx + 1,
              lineText: lineText.trim(),
              matchType: 'content',
            });
          }
        });
      }

      // De-duplicate if some files have multiple matches, prioritize showing them correctly
      res.json({ query: q, results });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- LINE ANNOTATIONS & HIGHLIGHTS ---

  // Get line annotations for specific file
  app.get('/api/annotations/:fileId', authenticateToken, async (req, res) => {
    try {
      const list = await db.lineAnnotations.findByFile(req.params.fileId);
      res.json(list);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Upsert/Create line annotation (Both notes and highlights)
  app.post('/api/annotations/:fileId', authenticateToken, async (req, res) => {
    try {
      const { fileId } = req.params;
      const { lineNumber, note, highlightColor } = req.body;

      if (lineNumber === undefined || lineNumber === null) {
        return res.status(400).json({ error: 'lineNumber is required.' });
      }

      const annotation = await db.lineAnnotations.upsert(fileId, Number(lineNumber), {
        note,
        highlightColor,
      });

      res.status(200).json(annotation);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Delete individual line annotation or highlight
  app.delete('/api/annotations/:fileId/:lineNumber', authenticateToken, async (req, res) => {
    try {
      const { fileId, lineNumber } = req.params;
      const success = await db.lineAnnotations.remove(fileId, Number(lineNumber));
      res.json({ success });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- SNIPPETS CRUD ---
  // Get all snippets
  app.get('/api/snippets', authenticateToken, async (req, res) => {
    try {
      const { search } = req.query;
      const list = await db.snippets.find(search ? String(search) : undefined);
      res.json(list);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Create snippet
  app.post('/api/snippets', authenticateToken, async (req, res) => {
    try {
      const { name, content, language } = req.body;
      if (!name || content === undefined) {
        return res.status(400).json({ error: 'Snippet name and content are required.' });
      }
      const snip = await db.snippets.create({
        name,
        content,
        language: language || 'plaintext'
      });
      res.status(201).json(snip);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Delete snippet
  app.delete('/api/snippets/:id', authenticateToken, async (req, res) => {
    try {
      const { id } = req.params;
      const success = await db.snippets.remove(id);
      res.json({ success });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- GLOBAL FIND & REPLACE ---
  app.post('/api/fs/replace-all', authenticateToken, async (req, res) => {
    try {
      const { findText, replaceText, languageFilter } = req.body;
      if (!findText) {
        return res.status(400).json({ error: 'Find text is required.' });
      }

      // Fetch all normal files
      const allFiles = await db.files.find({ isDeleted: false });
      let filesToUpdate = allFiles;

      // Filter by language if specified
      if (languageFilter && languageFilter !== 'all') {
        const queryLang = languageFilter.toLowerCase();
        filesToUpdate = allFiles.filter(f => f.language.toLowerCase() === queryLang);
      }

      let modifiedCount = 0;
      let totalReplacementCount = 0;

      for (const file of filesToUpdate) {
        if (file.content.includes(findText)) {
          const occurrences = file.content.split(findText).length - 1;
          if (occurrences > 0) {
            const newContent = file.content.split(findText).join(replaceText || '');
            await db.files.update(file._id, { content: newContent });
            modifiedCount++;
            totalReplacementCount += occurrences;
          }
        }
      }

      res.json({
        success: true,
        modifiedCount,
        totalReplacementCount,
        message: `Successfully replaced ${totalReplacementCount} occurrences across ${modifiedCount} files.`
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- GIST IMPORT ---
  app.post('/api/gist/import', authenticateToken, async (req, res) => {
    try {
      const { url, targetFolderId } = req.body;
      if (!url) {
        return res.status(400).json({ error: 'Gist URL or ID is required.' });
      }

      let gistId = url.trim();
      const lastSlashIdx = gistId.lastIndexOf('/');
      if (lastSlashIdx !== -1) {
        gistId = gistId.substring(lastSlashIdx + 1);
      }
      gistId = gistId.split('?')[0].split('#')[0];

      if (!gistId) {
        return res.status(400).json({ error: 'Invalid Gist ID.' });
      }

      const response = await fetch(`https://api.github.com/gists/${gistId}`, {
        headers: {
          'User-Agent': 'CodeVault-Applet-Importer'
        }
      });

      if (!response.ok) {
        throw new Error(`GitHub Gist API responded with status ${response.status}`);
      }

      const gistData = await response.json();
      const gistFiles = gistData.files;
      if (!gistFiles) {
        throw new Error('Gist files list is empty.');
      }

      const importedFiles = [];
      const parentFolderId = targetFolderId || null;

      const languageMapping = (filename) => {
        const ext = path.extname(filename).toLowerCase();
        if (['.js', '.mjs', '.cjs'].includes(ext)) return 'javascript';
        if (['.ts', '.mts'].includes(ext)) return 'typescript';
        if (['.py'].includes(ext)) return 'python';
        if (['.json'].includes(ext)) return 'json';
        if (['.html', '.htm'].includes(ext)) return 'html';
        if (['.css'].includes(ext)) return 'css';
        if (['.md', '.markdown'].includes(ext)) return 'markdown';
        if (['.sh', '.bash'].includes(ext)) return 'shell';
        return 'plaintext';
      };

      for (const filename of Object.keys(gistFiles)) {
        const fileObj = gistFiles[filename];
        const content = fileObj.content || '';
        const language = languageMapping(filename);

        const pathPrefix = parentFolderId ? `Gist-${gistId}/${filename}` : filename;

        const newFile = await db.files.create({
          name: filename,
          content,
          language,
          path: pathPrefix,
          folderId: parentFolderId
        });
        importedFiles.push(newFile);
      }

      res.status(201).json({
        success: true,
        files: importedFiles,
        message: `Imported ${importedFiles.length} files successfully.`
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Gist retrieval failed.' });
    }
  });

  // --- GITHUB REPOSITORY IMPORT ---
  app.post('/api/github/import-repo', authenticateToken, async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) {
        return res.status(400).json({ error: 'GitHub Repo URL is required.' });
      }

      let repoUrl = url.trim();
      repoUrl = repoUrl.replace(/\.git$/, '').replace(/\/$/, '');

      let owner = '';
      let repoName = '';
      let specifiedBranch = '';

      // Match typical GitHub repository layouts:
      // https://github.com/owner/repo/tree/branch-name or https://github.com/owner/repo
      const branchRegex = /github\.com\/([^\/]+)\/([^\/]+)\/tree\/([^\/]+)/i;
      const branchMatch = repoUrl.match(branchRegex);
      if (branchMatch) {
        owner = branchMatch[1];
        repoName = branchMatch[2];
        specifiedBranch = branchMatch[3];
      } else {
        const standardRegex = /(?:github\.com\/)?([a-zA-Z0-9-_\.]+)\/([a-zA-Z0-9-_\.]+)/i;
        const match = repoUrl.match(standardRegex);
        if (match) {
          owner = match[1];
          repoName = match[2];
        }
      }

      if (!owner || !repoName) {
        return res.status(400).json({ error: 'Failed to extract GitHub repository owner and name. Please verify the URL structure.' });
      }

      // 1. Fetch Repository Info to get Default Branch if not specified
      let branch = specifiedBranch;
      if (!branch) {
        const repoInfoRes = await fetch(`https://api.github.com/repos/${owner}/${repoName}`, {
          headers: { 'User-Agent': 'CodeVault-Applet-Importer' }
        });
        if (repoInfoRes.ok) {
          const repoInfo = await repoInfoRes.json();
          branch = repoInfo.default_branch || 'main';
        } else {
          branch = 'main'; // fallback
        }
      }

      // 2. Query GitHub Recursive Tree API
      const treeUrl = `https://api.github.com/repos/${owner}/${repoName}/git/trees/${branch}?recursive=1`;
      const treeRes = await fetch(treeUrl, {
        headers: { 'User-Agent': 'CodeVault-Applet-Importer' }
      });

      if (!treeRes.ok) {
        throw new Error(`GitHub Git Tree API responded with status ${treeRes.status}. Make sure the repository is public.`);
      }

      const treeData = await treeRes.json();
      if (!treeData || !Array.isArray(treeData.tree)) {
        throw new Error('Failed to retrieve file tree metadata from GitHub.');
      }

      const allBlobs = treeData.tree.filter((item: any) => item.type === 'blob');

      // 3. Filter Blobs (skip bin, vendor, lock, lockfiles, node_modules, logs)
      const isReadableTextFile = (filePath: string) => {
        const ext = path.extname(filePath).toLowerCase();
        const skipDirs = ['node_modules/', '.git/', 'dist/', 'build/', '.next/', '.expo/', 'vendor/', 'bin/', 'obj/', '.vscode/', 'yarn.lock', 'package-lock.json', 'pnpm-lock.yaml'];
        if (skipDirs.some(dir => filePath.includes(dir))) return false;

        const allowedExtensions = [
          '.ts', '.tsx', '.js', '.jsx', '.json', '.css', '.html', '.md',
          '.py', '.java', '.cpp', '.c', '.h', '.cs', '.go', '.rs', '.sh',
          '.yml', '.yaml', '.sql', '.toml', '.xml', '.txt', '.ini', '.cfg'
        ];
        return allowedExtensions.includes(ext);
      };

      const filteredBlobs = allBlobs.filter((item: any) => isReadableTextFile(item.path));

      if (filteredBlobs.length === 0) {
        return res.status(400).json({ error: 'No compatible code or markdown files found in the repository.' });
      }

      // Cap at 120 files to prevent performance loss and server thresholds
      const maxFiles = 120;
      const isCapped = filteredBlobs.length > maxFiles;
      const blobsToImport = filteredBlobs.slice(0, maxFiles);

      // Create directories first in hierarchy order
      const pathFolderMap = new Map<string, string>();
      for (const item of blobsToImport) {
        const parts = item.path.split('/');
        parts.pop(); // remove filename

        let currentParentId: string | null = null;
        let currentPath = '';

        for (const part of parts) {
          currentPath = currentPath ? `${currentPath}/${part}` : part;
          if (!pathFolderMap.has(currentPath)) {
            const existing = await db.folders.find({ name: part, parentId: currentParentId, isDeleted: false });
            let folderDb;
            if (existing.length > 0) {
              folderDb = existing[0];
            } else {
              folderDb = await db.folders.create({ name: part, parentId: currentParentId });
            }
            pathFolderMap.set(currentPath, folderDb._id);
            currentParentId = folderDb._id;
          } else {
            currentParentId = pathFolderMap.get(currentPath)!;
          }
        }
      }

      // Reusable language mapper
      const languageMapping = (filePath: string) => {
        const ext = path.extname(filePath).toLowerCase();
        if (['.js', '.mjs', '.cjs', '.jsx'].includes(ext)) return 'javascript';
        if (['.ts', '.mts', '.tsx'].includes(ext)) return 'typescript';
        if (['.py'].includes(ext)) return 'python';
        if (['.json'].includes(ext)) return 'json';
        if (['.html', '.htm'].includes(ext)) return 'html';
        if (['.css'].includes(ext)) return 'css';
        if (['.md', '.markdown'].includes(ext)) return 'markdown';
        if (['.sh', '.bash'].includes(ext)) return 'shell';
        if (['.sql'].includes(ext)) return 'sql';
        if (['.rs'].includes(ext)) return 'rust';
        if (['.go'].includes(ext)) return 'go';
        if (['.xml', '.svg'].includes(ext)) return 'xml';
        if (['.yaml', '.yml'].includes(ext)) return 'yaml';
        return 'plaintext';
      };

      // 4. Download file content and save to Database
      const importedFilesCount = [];
      for (const item of blobsToImport) {
        try {
          const rawUrl = `https://raw.githubusercontent.com/${owner}/${repoName}/${branch}/${item.path}`;
          const rawRes = await fetch(rawUrl, {
            headers: { 'User-Agent': 'CodeVault-Applet-Importer' }
          });

          let content = '';
          if (rawRes.ok) {
            content = await rawRes.text();
          } else {
            // fallback: fetch blob content via git api if raw returns not found
            const blobApiUrl = `https://api.github.com/repos/${owner}/${repoName}/git/blobs/${item.sha}`;
            const blobApiRes = await fetch(blobApiUrl, {
              headers: { 'User-Agent': 'CodeVault-Applet-Importer' }
            });
            if (blobApiRes.ok) {
              const blobData = await blobApiRes.json();
              if (blobData.encoding === 'base64') {
                content = Buffer.from(blobData.content, 'base64').toString('utf-8');
              } else {
                content = blobData.content;
              }
            }
          }

          const filename = path.basename(item.path);
          const parts = item.path.split('/');
          parts.pop();
          const parentFolderPath = parts.join('/');
          const folderId = pathFolderMap.get(parentFolderPath) || null;

          const dbFile = await db.files.create({
            name: filename,
            content,
            language: languageMapping(filename),
            path: item.path,
            folderId
          });
          importedFilesCount.push(dbFile);
        } catch (fileErr) {
          console.error(`Failed to fetch file ${item.path}:`, fileErr);
        }
      }

      const cappedMessage = isCapped ? ` (Note: capped at first ${maxFiles} primary files to prevent token space overflow in UI)` : '';
      res.status(201).json({
        success: true,
        message: `Imported GitHub repo ${owner}/${repoName} branch [${branch}]! Rebuilt ${pathFolderMap.size} directories and imported ${importedFilesCount.length} code files successfully.${cappedMessage}`
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to extract GitHub repository.' });
    }
  });

  // --- ZIP WORKSPACE EXPORT ---
  app.get('/api/fs/export/zip', authenticateToken, async (req, res) => {
    try {
      const allFiles = await db.files.find({ isDeleted: false });
      const allFolders = await db.folders.find({ isDeleted: false });

      const zip = new JSZip();
      const folderPathMap = new Map();

      const resolveFolderPath = (folderId) => {
        if (folderPathMap.has(folderId)) {
          return folderPathMap.get(folderId);
        }
        const matches = allFolders.find(f => f._id === folderId);
        if (!matches) return '';
        const parentPath = matches.parentId ? resolveFolderPath(matches.parentId) : '';
        const fullPath = parentPath ? `${parentPath}/${matches.name}` : matches.name;
        folderPathMap.set(folderId, fullPath);
        return fullPath;
      };

      allFolders.forEach(f => resolveFolderPath(f._id));

      for (const file of allFiles) {
        let zipFilePath = file.name;
        if (file.folderId) {
          const folderPath = folderPathMap.get(file.folderId);
          if (folderPath) {
            zipFilePath = `${folderPath}/${file.name}`;
          }
        }
        zip.file(zipFilePath, file.content);
      }

      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="codevault-workspace.zip"');
      res.setHeader('Content-Length', zipBuffer.length);
      res.end(zipBuffer);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- CLIENT-HOSTING INTEGRATION MIDDLEWARE ---

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Error boundary
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    console.error('Unhandled request exception:', err);
    res.status(500).json({ error: 'Internal server error occurred.' });
  });

  return app;
}

const appPromise = startServer();

if (!process.env.VERCEL) {
  appPromise.then(app => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`CodeVault full-stack server running perfectly on host 0.0.0.0 port ${PORT}`);
    });
  });
}

const handler = async (req: any, res: any) => {
  const app = await appPromise;
  return app(req, res);
};

export default handler;

