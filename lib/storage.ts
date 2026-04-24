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
const PAYMENT_UNLOCK_KEY = 'payment_unlocked';

const normalizeDocument = (row: any): Document | null => {
  const id = Number(row?.id);
  if (!Number.isFinite(id)) {
    return null;
  }

  const name = typeof row?.name === 'string' && row.name.trim().length > 0
    ? row.name
    : 'Untitled Document';
  const type = typeof row?.type === 'string' && row.type.trim().length > 0
    ? row.type
    : 'PDF';
  const uri = typeof row?.uri === 'string' ? row.uri : '';
  const date = typeof row?.date === 'string' && row.date.trim().length > 0
    ? row.date
    : 'Unknown date';
  const size = typeof row?.size === 'string' && row.size.trim().length > 0
    ? row.size
    : 'Unknown size';
  const pagesValue = row?.pages;
  const pages =
    typeof pagesValue === 'number' || typeof pagesValue === 'string'
      ? pagesValue
      : '1';
  const status: DocumentStatus = row?.status === 'DRAFT' ? 'DRAFT' : 'EXPORTED';

  return {
    id,
    name,
    type,
    uri,
    date,
    size,
    pages,
    status,
  };
};

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
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
  `);

  // Migration: Ensure status column exists if the table was created before
  const tableInfo = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(documents)`);
  const hasStatusColumn = tableInfo.some(col => col.name === 'status');
  
  if (!hasStatusColumn) {
    await db.execAsync(`ALTER TABLE documents ADD COLUMN status TEXT DEFAULT 'EXPORTED'`);
  }
};

const getAppSetting = async (key: string): Promise<string | null> => {
  const result = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM app_settings WHERE key = ?',
    [key]
  );
  return result?.value ?? null;
};

const setAppSetting = async (key: string, value: string) => {
  await db.runAsync(
    'INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)',
    [key, value]
  );
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
  return allRows
    .map((row) => normalizeDocument(row))
    .filter((row): row is Document => row !== null);
};

export const getDocumentsCount = async (): Promise<number> => {
  const result = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM documents');
  return result?.count ?? 0;
};

export const getExportedDocumentsCount = async (): Promise<number> => {
  const result = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM documents WHERE status = 'EXPORTED'"
  );
  return result?.count ?? 0;
};

export const isPaymentUnlocked = async (): Promise<boolean> => {
  const value = await getAppSetting(PAYMENT_UNLOCK_KEY);
  return value === '1';
};

export const setPaymentUnlocked = async (unlocked: boolean) => {
  await setAppSetting(PAYMENT_UNLOCK_KEY, unlocked ? '1' : '0');
};

export const deleteDocument = async (id: number) => {
  await db.runAsync('DELETE FROM documents WHERE id = ?', [id]);
};
