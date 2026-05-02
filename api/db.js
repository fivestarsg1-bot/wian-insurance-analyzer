const https = require('https');
const http  = require('http');
const { readBody } = require('./_rag');

// https.request 기반 Supabase REST 호출 (fetch 미사용 — Node 16 호환)
function supaRequest(method, path, body) {
    const base = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
    let url;
    try { url = new URL(base + path); }
    catch (e) { return Promise.reject(new Error(`Invalid URL: ${base + path}`)); }

    const mod     = url.protocol === 'https:' ? https : http;
    const buf     = body ? Buffer.from(body) : null;
    const headers = {
        'apikey':        process.env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type':  'application/json',
        'Prefer':        'return=representation',
    };
    if (buf) headers['Content-Length'] = buf.length;

    return new Promise((resolve, reject) => {
        const req = mod.request(
            { hostname: url.hostname, path: url.pathname + url.search,
              method, headers },
            res => {
                const chunks = [];
                res.on('data', c => chunks.push(c));
                res.on('end', () => {
                    const text = Buffer.concat(chunks).toString();
                    let data;
                    try { data = JSON.parse(text); } catch { data = { error: text }; }
                    resolve({ status: res.statusCode, data });
                });
            }
        );
        req.on('error', reject);
        if (buf) req.write(buf);
        req.end();
    });
}

module.exports = async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        return res.status(503).json({ error: 'Supabase 환경변수 미설정' });
    }

    const params = new URL(req.url, 'http://x').searchParams;
    const table  = params.get('table');
    const id     = params.get('id');
    const filter = params.get('filter');

    if (!table) return res.status(400).json({ error: 'table 파라미터 필요' });

    let path = `/rest/v1/${table}`;
    if (id)          path += `?id=eq.${id}`;
    else if (filter) path += `?${filter}`;

    let body;
    if (['POST', 'PATCH'].includes(req.method)) {
        const raw = await readBody(req);
        body = raw ? raw.toString() : undefined;
    }

    try {
        const { status, data } = await supaRequest(req.method, path, body);
        if (status === 204) return res.status(204).end();
        res.status(status).json(data);
    } catch (err) {
        res.status(502).json({ error: `Supabase 연결 오류: ${err.message}` });
    }
};
