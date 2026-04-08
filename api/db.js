const { readBody } = require('./_rag');

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

    let url = `${SUPABASE_URL}/rest/v1/${table}`;
    if (id)          url += `?id=eq.${id}`;
    else if (filter) url += `?${filter}`;

    const headers = {
        'apikey':        SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type':  'application/json',
        'Prefer':        'return=representation',
    };

    let body;
    if (['POST', 'PATCH'].includes(req.method)) {
        const raw = await readBody(req);
        body = raw || undefined;
    }

    const sbRes = await fetch(url, {
        method:  req.method,
        headers,
        body,
    });

    if (sbRes.status === 204) return res.status(204).end();
    const data = await sbRes.json();
    res.status(sbRes.status).json(data);
};
