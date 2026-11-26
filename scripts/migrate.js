import fs from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { env } from '../config/env.js';
import { applySecuritySchema } from './securitySchema.js';
const { database, ...connectionOptions } = env.db;
if (database === 'defaultdb') throw Error('Banco fora do escopo da migration.');
const admin = await mysql.createConnection(connectionOptions);
try {
  await admin.query('CREATE DATABASE IF NOT EXISTS ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci', [database]);
} finally {
  await admin.end();
}
const pool = mysql.createPool({ ...env.db, charset: 'utf8mb4', waitForConnections: true, connectionLimit: 10 });
const sql = await fs.readFile(new URL('../database/schema.sql', import.meta.url), 'utf8');
try {
  for (const statement of sql.split(/;\s*\n/).map((value) => value.trim()).filter(Boolean)) {
    await pool.query(statement.replace(/^CREATE TABLE /i, 'CREATE TABLE IF NOT EXISTS '));
  }
  const [columns] = await pool.query("SHOW COLUMNS FROM surveys LIKE 'overall_rating'");
  if (!columns.length) {
    await pool.query('ALTER TABLE surveys ADD COLUMN overall_rating TINYINT UNSIGNED NULL');
  }
  await pool.query(await fs.readFile(new URL('../database/migrations/001_user_notifications.sql', import.meta.url), 'utf8'));
  const security = await pool.getConnection();
  try { await applySecuritySchema(security, database); }
  finally { security.release(); }
  console.log('Banco e schema aplicados.');
} finally {
  await pool.end();
}
