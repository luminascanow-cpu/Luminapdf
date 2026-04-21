import * as SQLite from 'expo-sqlite';

export type DocumentStatus = 'DRAFT' | 'EXPORTED';

export interface Document {
  id: number;
  name: string;
  type: string;
  uri: string;
  date: string;
  size: string;
  pages: string | number;
  status: DocumentStatus;
}

const db = SQLite.openDatabaseSync('luminascan.db');

export const initDatabase = async () => {
  // Create table
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      uri TEXT NOT NULL,
      date TEXT NOT NULL,
      size TEXT NOT NULL,
      pages TEXT NOT NULL,
      status TEXT DEFAULT 'EXPORTED'
    );
  `);

  // Migration: Ensure status column exists if the table was created before
  const tableInfo = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(documents)`);
  const hasStatusColumn = tableInfo.some(col => col.name === 'status');
  
  if (!hasStatusColumn) {
    await db.execAsync(`ALTER TABLE documents ADD COLUMN status TEXT DEFAULT 'EXPORTED'`);
  }
};

export const saveDocument = async (doc: Omit<Document, 'id'>): Promise<Document> => {
  const result = await db.runAsync(
    'INSERT INTO documents (name, type, uri, date, size, pages, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [doc.name, doc.type, doc.uri, doc.date, doc.size, doc.pages.toString(), doc.status]
  );
  
  const newDoc = { ...doc, id: result.lastInsertRowId };
  
  return newDoc;
};

export const updateDocument = async (id: number, doc: Partial<Omit<Document, 'id'>>) => {
  const sets: string[] = [];
  const vals: any[] = [];
  
  Object.entries(doc).forEach(([key, value]) => {
    sets.push(`${key} = ?`);
    vals.push(value);
  });
  
  if (sets.length === 0) return;
  
  vals.push(id);
  await db.runAsync(
    `UPDATE documents SET ${sets.join(', ')} WHERE id = ?`,
    vals
  );
};

export const getDocuments = async (): Promise<Document[]> => {
  const allRows = await db.getAllAsync('SELECT * FROM documents ORDER BY id DESC');
  return allRows as Document[];
};

export const getDocumentsCount = async (): Promise<number> => {
  const result = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM documents');
  return result?.count ?? 0;
};

export const deleteDocument = async (id: number) => {
  await db.runAsync('DELETE FROM documents WHERE id = ?', [id]);
};
