// Simple express server providing a minimal users API backed by SQLite (db.sqlite)
// Note: This is for local dev only; place it behind proper auth and validation in prod.

const path = require('path');
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8082; // production default in docker
const HOST = process.env.HOST || '0.0.0.0';
const API_BASE = String(process.env.API_BASE || '').trim().replace(/\/$/, '');
const IMAGE_UPLOAD_BASE = (process.env.IMAGE_UPLOAD_BASE || 'https://rrimg.chinatownlogistic.com').replace(/\/$/, '');
const FORCE_HTTP = String(process.env.FORCE_HTTP || 'false').toLowerCase() === 'true';
const FORCE_HTTPS = String(process.env.FORCE_HTTPS || 'false').toLowerCase() === 'true';
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'db.sqlite');

if (!API_BASE) {
  console.error('Missing required env var: API_BASE');
  process.exit(1);
}

function toAbsoluteURL(base, rawPath) {
  const v = String(rawPath || '').trim();
  if (!v) return '';
  if (/^https?:\/\//i.test(v)) return v;
  return `${base}${v.startsWith('/') ? '' : '/'}${v}`;
}

app.use(bodyParser.json());
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Actor-Username');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Fuerza no-cache para archivos base del shell (evita usuarios pegados a versiones viejas)
app.use((req, res, next) => {
  const p = req.path || '';
  if (p === '/index.html' || p === '/manifest.json' || p === '/config.json') {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});

// Health check sencillo para orquestadores (Coolify)
app.get('/health', (_req, res) => res.json({ ok: true }));

// Activar trust proxy si forzamos algún protocolo
if (FORCE_HTTP || FORCE_HTTPS) {
  app.enable('trust proxy');
}

// Si se configura FORCE_HTTPS, redirige cualquier request HTTP a HTTPS
if (FORCE_HTTPS) {
  app.use((req, res, next) => {
    const proto = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
    if (proto !== 'https') {
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      return res.redirect(`https://${host}${req.url}`);
    }
    next();
  });
} else if (FORCE_HTTP) {
  // Si se configura FORCE_HTTP (y NO FORCE_HTTPS), redirige HTTPS a HTTP
  app.use((req, res, next) => {
    const proto = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
    if (proto === 'https') {
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      return res.redirect(`http://${host}${req.url}`);
    }
    next();
  });
}

// Proxy ligero para /api/* hacia API_BASE para evitar CORS en el navegador
app.use('/api', async (req, res) => {
  try {
    const targetUrl = API_BASE + req.originalUrl; // mantiene /api/...
    const forwardedProto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http')
      .split(',')[0]
      .trim();
    const forwardedHost = String(req.headers['x-forwarded-host'] || req.headers.host || '')
      .split(',')[0]
      .trim();

    const init = {
      method: req.method,
      headers: {
        // Propaga content-type si existe
        ...(req.headers['content-type'] ? { 'content-type': req.headers['content-type'] } : {}),
        ...(req.headers['accept'] ? { 'accept': req.headers['accept'] } : {}),
        // Preserva el host/protocolo visible por el cliente para URLs absolutas generadas por la API.
        ...(forwardedProto ? { 'x-forwarded-proto': forwardedProto } : {}),
        ...(forwardedHost ? { 'x-forwarded-host': forwardedHost } : {}),
      },
    };
    if (!['GET', 'HEAD'].includes(req.method)) {
      // JSON parseado por bodyParser.json
      if (req.is('application/json') && typeof req.body === 'object') {
        init.body = JSON.stringify(req.body);
      } else if (typeof req.body === 'string') {
        init.body = req.body;
      } else {
        // Importante: para multipart/form-data y otros payloads binarios
        // debemos reenviar el stream original o se pierde el body.
        init.body = req;
        init.duplex = 'half';
      }
    }
    const upstream = await fetch(targetUrl, init);
    const contentType = upstream.headers.get('content-type') || 'application/json; charset=utf-8';
    res.status(upstream.status);
    res.setHeader('content-type', contentType);
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.end(buf);
  } catch (e) {
    res.status(502).json({ error: 'Bad Gateway', detail: String(e && e.message || e) });
  }
});

// Proxy ligero para /uploads/* hacia API_BASE para exponer PDFs firmados en el mismo dominio del frontend.
app.use('/uploads', async (req, res) => {
  try {
    const targetUrl = API_BASE + req.originalUrl;
    const init = {
      method: req.method,
      headers: {
        ...(req.headers['accept'] ? { 'accept': req.headers['accept'] } : {}),
      },
    };
    const upstream = await fetch(targetUrl, init);
    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    res.status(upstream.status);
    res.setHeader('content-type', contentType);
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.end(buf);
  } catch (e) {
    res.status(502).json({ error: 'Bad Gateway', detail: String(e && e.message || e) });
  }
});

// Proxy para subir imágenes a servicio externo desde el backend del frontend.
// El cliente solo llama /external/upload y no necesita conocer dominios externos.
app.post('/external/upload', async (req, res) => {
  try {
    const targetUrl = `${IMAGE_UPLOAD_BASE}/upload`;
    const upstream = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        ...(req.headers['content-type'] ? { 'content-type': req.headers['content-type'] } : {}),
        ...(req.headers['accept'] ? { 'accept': req.headers['accept'] } : {}),
      },
      body: req,
      duplex: 'half',
    });

    const contentType = upstream.headers.get('content-type') || 'application/json; charset=utf-8';
    const raw = Buffer.from(await upstream.arrayBuffer());

    res.status(upstream.status);
    res.setHeader('content-type', contentType);

    if (contentType.includes('application/json')) {
      try {
        const payload = JSON.parse(raw.toString('utf8'));
        if (payload && typeof payload === 'object' && typeof payload.url === 'string') {
          payload.url = toAbsoluteURL(IMAGE_UPLOAD_BASE, payload.url);
        }
        return res.json(payload);
      } catch (_) {
        // Si upstream marcó JSON pero devolvió algo inválido, reenviamos tal cual.
      }
    }

    res.end(raw);
  } catch (e) {
    res.status(502).json({ error: 'Bad Gateway', detail: String(e && e.message || e) });
  }
});

// Config del cliente: permitir sobreescribir /config.json con envs en runtime
app.get('/config.json', (_req, res) => {
  try {
    const clientApi = (process.env.CLIENT_API_BASE || '').replace(/\/$/, '');
    const config = {
      uploadProxyPath: '/external/upload',
    };
    // Solo CLIENT_API_BASE puede sobreescribir la base del cliente.
    // API_BASE es para el proxy del servidor y NO debe forzar al cliente a llamar cross-origin.
    if (clientApi) config.apiBase = clientApi + '/';

    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return res.json(config);
  } catch (_) {
    return res.json({ uploadProxyPath: '/external/upload' });
  }
});

// Ensure DB directory and file exist
try {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DB_PATH)) fs.closeSync(fs.openSync(DB_PATH, 'w'));
} catch (e) {
  console.error('Error initializing DB path:', e);
}

const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY,
    displayName TEXT NOT NULL,
    pin TEXT,
    role TEXT NOT NULL DEFAULT 'user'
  )`);
});

// Helpers
function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}
function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, function (err, rows) {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}
function get(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, function (err, row) {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

async function getDevCount() {
  const row = await get(db, "SELECT COUNT(*) as cnt FROM users WHERE role = 'dev'");
  return row?.cnt || 0;
}

// Users API
app.get('/usuarios', async (req, res) => {
  try {
    const rows = await all(db, 'SELECT username, displayName, role FROM users ORDER BY username ASC');
    res.json(rows);
  } catch (e) {
    res.status(500).send(e.message || 'Error');
  }
});

app.post('/usuarios', async (req, res) => {
  try {
    const { username, displayName, pin, role } = req.body || {};
    if (!username || !displayName) return res.status(400).send('username y displayName requeridos');
    const exists = await get(db, 'SELECT username FROM users WHERE username = ?', [username]);
    if (exists) return res.status(409).send('Usuario ya existe');
    await run(db, 'INSERT INTO users (username, displayName, pin, role) VALUES (?,?,?,?)', [username, displayName, pin || null, role || 'user']);
    res.status(201).json({ ok: true });
  } catch (e) {
    res.status(500).send(e.message || 'Error');
  }
});

app.put('/usuarios/:username', async (req, res) => {
  try {
    const username = req.params.username;
    const { displayName, pin, role } = req.body || {};
    const current = await get(db, 'SELECT username, role FROM users WHERE username = ?', [username]);
    if (!current) return res.status(404).send('Usuario no encontrado');

    // If changing role away from dev, ensure at least one dev remains
    if (role != null && current.role === 'dev' && role !== 'dev') {
      const devCount = await getDevCount();
      if (devCount <= 1) {
        return res.status(400).send('Debe quedar al menos un usuario con rol dev');
      }
    }

    const sets = [];
    const params = [];
    if (displayName != null) { sets.push('displayName = ?'); params.push(displayName); }
    if (pin != null) { sets.push('pin = ?'); params.push(pin); }
    if (role != null) { sets.push('role = ?'); params.push(role); }
    if (sets.length === 0) return res.status(400).send('Nada que actualizar');
    params.push(username);
    await run(db, `UPDATE users SET ${sets.join(', ')} WHERE username = ?`, params);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).send(e.message || 'Error');
  }
});

app.delete('/usuarios/:username', async (req, res) => {
  try {
    const username = req.params.username;
    const actor = req.header('x-actor-username') || req.header('X-Actor-Username') || '';
    const target = await get(db, 'SELECT username, role FROM users WHERE username = ?', [username]);
    if (!target) return res.status(404).send('Usuario no encontrado');

    if (actor && actor === username) {
      return res.status(400).send('No puedes eliminarte a ti mismo');
    }

    if (target.role === 'dev') {
      const devCount = await getDevCount();
      if (devCount <= 1) {
        return res.status(400).send('Debe quedar al menos un usuario con rol dev');
      }
    }

    await run(db, 'DELETE FROM users WHERE username = ?', [username]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).send(e.message || 'Error');
  }
});

// Login (valida PIN plano en DB)
app.post('/login', async (req, res) => {
  try {
    const { username, pin } = req.body || {};
    if (!username || !pin) return res.status(400).send('Usuario y PIN requeridos');
    const row = await get(db, 'SELECT username, displayName, role, pin FROM users WHERE username = ?', [username]);
    if (!row) return res.status(404).send('Usuario no encontrado');
    if (String(row.pin || '') !== String(pin)) return res.status(401).send('PIN incorrecto');
    return res.json({ ok: true, username: row.username, displayName: row.displayName, role: row.role });
  } catch (e) {
    res.status(500).send(e.message || 'Error');
  }
});

// Sirve el frontend (build) en producción desde el mismo servidor
try {
  const buildPath = path.resolve(__dirname, '..', 'build');
  if (fs.existsSync(buildPath)) {
    app.use(express.static(buildPath, {
      // Cache largo para assets con hash; index.html/manifest/config ya se marcan como no-cache por middleware
      setHeaders: (res, filePath) => {
        const ext = path.extname(filePath);
        const base = path.basename(filePath);
        if (base === 'index.html' || base === 'manifest.json' || base === 'config.json') {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        } else if (/\.(?:js|css|png|jpg|jpeg|gif|svg|ico|webp|avif|woff|woff2|ttf|map)$/i.test(ext)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      }
    }));
    // Fallback para rutas del SPA (excluye endpoints de API)
    app.get('*', (req, res, next) => {
  // Sólo excluimos rutas de API reales. GET /login es una ruta del SPA.
  if (req.path.startsWith('/usuarios')) return next();
      // Asegurar que el HTML del shell no se cachee
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      return res.sendFile(path.join(buildPath, 'index.html'));
    });
  }
} catch (_) { /* noop */ }

app.listen(PORT, HOST, () => {
  console.log(`Users server running on http://${HOST}:${PORT}`);
});
