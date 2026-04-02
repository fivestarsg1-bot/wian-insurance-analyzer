// ─── 공통 유틸리티 ────────────────────────────────────────────────
// textToVector, chunkText, supaFetch, readBody, sendJSON

const https = require('https');
const http  = require('http');

// ── 해시 함수 (cyrb53) ────────────────────────────────────────────
function cyrb53(str, seed = 0) {
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < str.length; i++) {
        const ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

// ── 텍스트 → 256차원 해시 임베딩 (한글 바이그램 + 어절 TF-IDF) ──
const EMBED_DIM = 256;

function textToVector(text) {
    const tokens = [];

    // 어절 토큰 (2글자 이상)
    text.replace(/[^\uAC00-\uD7A3a-zA-Z0-9]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length >= 2)
        .forEach(w => tokens.push(w));

    // 한글 2-그램
    const han = text.replace(/[^\uAC00-\uD7A3]/g, '');
    for (let i = 0; i < han.length - 1; i++) tokens.push(han.slice(i, i + 2));

    if (!tokens.length) return new Array(EMBED_DIM).fill(0);

    // 빈도 계산
    const freq = {};
    for (const t of tokens) freq[t] = (freq[t] || 0) + 1;

    // 해시 → 벡터 (log 스무딩)
    const vec = new Float64Array(EMBED_DIM);
    for (const [token, count] of Object.entries(freq)) {
        vec[cyrb53(token) % EMBED_DIM] += Math.log1p(count);
    }

    // L2 정규화
    const norm = Math.sqrt(vec.reduce((s, x) => s + x * x, 0));
    if (norm > 0) for (let i = 0; i < EMBED_DIM; i++) vec[i] /= norm;

    return Array.from(vec);
}

// ── 텍스트 청크 분할 ──────────────────────────────────────────────
function chunkText(text, size = 500, overlap = 100) {
    const paras = text
        .split(/\n{2,}|\n(?=제\s*\d+조|[①-⑩○●]|\d+\.\s)/)
        .map(p => p.trim())
        .filter(p => p.length > 20);

    const chunks = [];
    let buf = '';
    for (const para of paras) {
        if (buf && (buf + '\n' + para).length > size) {
            chunks.push(buf.trim());
            buf = buf.length > overlap ? buf.slice(-overlap) + '\n' + para : para;
        } else {
            buf = buf ? buf + '\n' + para : para;
        }
    }
    if (buf.trim().length >= 40) chunks.push(buf.trim());
    return chunks;
}

// ── Supabase REST API 헬퍼 ────────────────────────────────────────
function supaFetch(path, options = {}) {
    const base = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
    const urlStr = base + path;
    let url;
    try { url = new URL(urlStr); }
    catch { return Promise.reject(new Error(`Invalid Supabase URL: ${urlStr}`)); }

    const isHttps = url.protocol === 'https:';
    const mod     = isHttps ? https : http;
    const body    = options.body ? Buffer.from(options.body) : null;

    const headers = {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'apikey':        process.env.SUPABASE_SERVICE_ROLE_KEY,
        ...(options.headers || {}),
    };
    if (body) headers['Content-Length'] = body.length;

    return new Promise((resolve, reject) => {
        const req = mod.request(
            { hostname: url.hostname, path: url.pathname + url.search,
              method: options.method || 'GET', headers },
            res => {
                const chunks = [];
                res.on('data', c => chunks.push(c));
                res.on('end', () => {
                    const text = Buffer.concat(chunks).toString();
                    if (res.statusCode >= 400) {
                        reject(new Error(`Supabase ${res.statusCode}: ${text}`));
                    } else {
                        try { resolve(JSON.parse(text)); }
                        catch  { resolve(text); }
                    }
                });
            }
        );
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

// ── 요청 바디 읽기 (Vercel req.body / Node.js stream 양립) ───────
function readBody(req) {
    if (req.body !== undefined) {
        const s = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
        return Promise.resolve(s);
    }
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end',  () => resolve(Buffer.concat(chunks).toString()));
        req.on('error', reject);
    });
}

// ── 공통 JSON 응답 (Vercel res.json / Node.js res.writeHead 양립) ─
function sendJSON(res, code, data) {
    const body = JSON.stringify(data);
    if (typeof res.writeHead === 'function') {
        res.writeHead(code, { 'Content-Type': 'application/json' });
        res.end(body);
    } else {
        res.status(code).json(data);
    }
}

module.exports = { textToVector, chunkText, supaFetch, readBody, sendJSON, EMBED_DIM };
