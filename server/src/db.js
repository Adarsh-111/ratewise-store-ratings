import pg from 'pg';
import 'dotenv/config';
const { Pool } = pg;
export const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined });
export const query = (text, params) => pool.query(text, params);
