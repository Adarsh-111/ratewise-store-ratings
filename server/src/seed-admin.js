import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { query, pool } from './db.js';
const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
if (!ADMIN_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD) throw new Error('Set ADMIN_NAME, ADMIN_EMAIL, and ADMIN_PASSWORD first.');
if (ADMIN_NAME.length < 20 || ADMIN_NAME.length > 60 || ADMIN_PASSWORD.length < 8 || ADMIN_PASSWORD.length > 16 || !/[A-Z]/.test(ADMIN_PASSWORD) || !/[^A-Za-z0-9]/.test(ADMIN_PASSWORD)) throw new Error('Admin name or password does not meet validation rules.');
try { await query(`INSERT INTO users(name,email,address,password_hash,role) VALUES($1,$2,'',$3,'admin') ON CONFLICT(email) DO NOTHING`, [ADMIN_NAME,ADMIN_EMAIL,await bcrypt.hash(ADMIN_PASSWORD,12)]); console.log('Admin account is ready.'); } finally { await pool.end(); }
