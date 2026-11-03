CREATE TYPE user_role AS ENUM ('admin', 'user', 'owner');
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(60) NOT NULL CHECK (char_length(name) BETWEEN 20 AND 60),
  email VARCHAR(254) NOT NULL UNIQUE,
  address VARCHAR(400) NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE stores (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(254) NOT NULL,
  address VARCHAR(400) NOT NULL,
  owner_id BIGINT UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE ratings (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score SMALLINT NOT NULL CHECK (score BETWEEN 1 AND 5),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (store_id, user_id)
);
CREATE INDEX ratings_store_id_idx ON ratings(store_id);
CREATE INDEX ratings_user_id_idx ON ratings(user_id);
CREATE INDEX stores_name_idx ON stores(name);
CREATE INDEX users_role_idx ON users(role);
