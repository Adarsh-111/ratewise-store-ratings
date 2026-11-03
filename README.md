# RateWise

Store ratings app built with React, Express, and PostgreSQL.

## Run locally

1. Install Node.js 20+ and PostgreSQL 15+.
2. Create a database named `ratewise` (or set `DATABASE_URL`).
3. Copy `server/.env.example` to `server/.env` and set a long `JWT_SECRET` and database connection string.
4. Run `npm install`, then `npm run dev`.
5. Open `http://localhost:5173`. The API runs on `http://localhost:4000`.

Apply `server/schema.sql` to initialize the database. To create the first admin, set `ADMIN_NAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` in `server/.env`, then run `npm --workspace server run seed:admin`.

Public signup always creates a normal user. Admins create store owner accounts and stores from the admin dashboard. Passwords are hashed with bcrypt; API routes enforce role access and validate inputs server side.
