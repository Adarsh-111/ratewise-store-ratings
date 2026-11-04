import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, query } from './db.js';
import { authenticate, allow, validate } from './middleware.js';
import { signupSchema, loginSchema, passwordSchema, ratingSchema, userSchema, storeSchema } from './validation.js';

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET must be set to at least 32 characters.');
const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '20kb' }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 40 }));
const userFields = 'id, name, email, address, role';
function tokenFor(user) { return jwt.sign({ id: user.id, role: user.role, name: user.name }, process.env.JWT_SECRET, { expiresIn: '12h' }); }
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

app.post('/api/auth/signup', validate(signupSchema), async (req, res, next) => {
  try {
    const { name, email, address, password } = req.validated;
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await query(`INSERT INTO users(name,email,address,password_hash,role) VALUES($1,$2,$3,$4,'user') RETURNING ${userFields}`, [name,email,address,hash]);
    res.status(201).json({ token: tokenFor(rows[0]), user: rows[0] });
  } catch (e) { if (e.code === '23505') return res.status(409).json({ error: 'An account with this email already exists.' }); next(e); }
});
app.post('/api/auth/login', validate(loginSchema), async (req, res, next) => {
  try {
    const { rows } = await query(`SELECT ${userFields}, password_hash FROM users WHERE lower(email)=lower($1)`, [req.validated.email]);
    if (!rows[0] || !(await bcrypt.compare(req.validated.password, rows[0].password_hash))) return res.status(401).json({ error: 'Email or password is incorrect.' });
    const { password_hash, ...user } = rows[0]; res.json({ token: tokenFor(user), user });
  } catch (e) { next(e); }
});
app.get('/api/auth/me', authenticate, async (req, res, next) => { try { const { rows } = await query(`SELECT ${userFields} FROM users WHERE id=$1`, [req.user.id]); rows[0] ? res.json(rows[0]) : res.status(401).json({ error: 'Account no longer exists.' }); } catch(e) { next(e); } });
app.patch('/api/auth/password', authenticate, validate(passwordSchema), async (req, res, next) => { try { await query('UPDATE users SET password_hash=$1 WHERE id=$2', [await bcrypt.hash(req.validated.password,12),req.user.id]); res.json({ message: 'Password updated.' }); } catch(e) { next(e); } });

app.get('/api/stores', authenticate, async (req,res,next) => {
  try { const term = `%${(req.query.search || '').trim()}%`; const { rows } = await query(`SELECT s.id,s.name,s.email,s.address,COALESCE(AVG(r.score),0)::numeric(3,2) AS average_rating,COUNT(r.id)::int AS rating_count,ur.score AS user_rating FROM stores s LEFT JOIN ratings r ON r.store_id=s.id LEFT JOIN ratings ur ON ur.store_id=s.id AND ur.user_id=$1 WHERE s.name ILIKE $2 OR s.address ILIKE $2 GROUP BY s.id,ur.score ORDER BY s.name ASC`, [req.user.id,term]); res.json(rows); } catch(e) { next(e); }
});
app.put('/api/stores/:id/rating', authenticate, allow('user'), validate(ratingSchema), async (req,res,next) => { try { const { rows } = await query(`INSERT INTO ratings(store_id,user_id,score) SELECT id,$2,$3 FROM stores WHERE id=$1 ON CONFLICT(store_id,user_id) DO UPDATE SET score=EXCLUDED.score,updated_at=NOW() RETURNING id,score,updated_at`, [req.params.id,req.user.id,req.validated.score]); rows[0] ? res.json(rows[0]) : res.status(404).json({ error: 'Store not found.' }); } catch(e) { next(e); } });

app.get('/api/owner/dashboard', authenticate, allow('owner'), async (req,res,next) => { try { const { rows } = await query(`SELECT s.id AS store_id,s.name AS store_name,s.address,COALESCE(AVG(r.score),0)::numeric(3,2) AS average_rating,COUNT(r.id)::int AS rating_count FROM stores s LEFT JOIN ratings r ON r.store_id=s.id WHERE s.owner_id=$1 GROUP BY s.id`,[req.user.id]); if(!rows.length) return res.json({store:null,ratings:[]}); const ratings=await query(`SELECT u.name,u.email,r.score,r.updated_at FROM ratings r JOIN users u ON u.id=r.user_id JOIN stores s ON s.id=r.store_id WHERE s.owner_id=$1 ORDER BY r.updated_at DESC`,[req.user.id]); res.json({store:rows[0],ratings:ratings.rows}); } catch(e) { next(e); } });

app.get('/api/admin/summary', authenticate, allow('admin'), async (_req,res,next) => { try { const { rows }=await query(`SELECT (SELECT COUNT(*)::int FROM users) AS users,(SELECT COUNT(*)::int FROM stores) AS stores,(SELECT COUNT(*)::int FROM ratings) AS ratings`); res.json(rows[0]); } catch(e) { next(e); } });
app.get('/api/admin/users', authenticate, allow('admin'), async (req,res,next) => { try { const term=`%${(req.query.search||'').trim()}%`; const role=req.query.role||null; const {rows}=await query(`SELECT ${userFields},CASE WHEN role='owner' THEN (SELECT COALESCE(AVG(r.score),0)::numeric(3,2) FROM stores s LEFT JOIN ratings r ON r.store_id=s.id WHERE s.owner_id=users.id) END AS rating FROM users WHERE (name ILIKE $1 OR email ILIKE $1 OR address ILIKE $1) AND ($2::user_role IS NULL OR role=$2) ORDER BY ${['name','email','address','role'].includes(req.query.sort)?req.query.sort:'name'} ${req.query.direction==='desc'?'DESC':'ASC'}`,[term,role]); res.json(rows); } catch(e) { next(e); } });
app.get('/api/admin/stores', authenticate, allow('admin'), async (req,res,next) => { try { const term=`%${(req.query.search||'').trim()}%`; const {rows}=await query(`SELECT s.id,s.name,s.email,s.address,s.owner_id,u.name AS owner_name,COALESCE(AVG(r.score),0)::numeric(3,2) AS average_rating,COUNT(r.id)::int AS rating_count FROM stores s LEFT JOIN users u ON u.id=s.owner_id LEFT JOIN ratings r ON r.store_id=s.id WHERE s.name ILIKE $1 OR s.email ILIKE $1 OR s.address ILIKE $1 GROUP BY s.id,u.name ORDER BY ${['name','email','address'].includes(req.query.sort)?req.query.sort:'name'} ${req.query.direction==='desc'?'DESC':'ASC'}`,[term]); res.json(rows); } catch(e) { next(e); } });
app.post('/api/admin/users', authenticate, allow('admin'), validate(userSchema), async (req,res,next) => { try { const {name,email,address,password,role}=req.validated; const hash=await bcrypt.hash(password,12); const {rows}=await query(`INSERT INTO users(name,email,address,password_hash,role) VALUES($1,$2,$3,$4,$5) RETURNING ${userFields}`,[name,email,address,hash,role]); res.status(201).json(rows[0]); } catch(e) { if(e.code==='23505') return res.status(409).json({error:'Email is already in use.'}); next(e); } });
app.post('/api/admin/stores', authenticate, allow('admin'), validate(storeSchema), async (req,res,next) => { try { const {name,email,address,ownerId}=req.validated; const {rows}=await query(`INSERT INTO stores(name,email,address,owner_id) VALUES($1,$2,$3,$4) RETURNING *`,[name,email,address,ownerId||null]); res.status(201).json(rows[0]); } catch(e) { if(e.code==='23503') return res.status(400).json({error:'Selected owner does not exist.'}); if(e.code==='23505') return res.status(409).json({error:'This owner is already linked to a store.'}); next(e); } });
app.use((err,_req,res,_next)=>{ console.error(err); res.status(500).json({error:'Something went wrong. Please try again.'}); });
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const clientDist = path.join(projectRoot, 'client', 'dist');
app.use('/api', (_req,res)=>res.status(404).json({error:'API route not found.'}));
app.use(express.static(clientDist));
app.get('*', (_req,res)=>res.sendFile(path.join(clientDist, 'index.html')));
const port=process.env.PORT||4000;
app.listen(port,()=>console.log(`RateWise API listening on ${port}`));
process.on('SIGTERM',()=>pool.end());
