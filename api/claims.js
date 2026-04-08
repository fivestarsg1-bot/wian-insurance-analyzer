const { supaFetch, sendJSON, readBody } = require('./_rag');
const { validateToken } = require('./_token');

const HEADERS_RETURN = { 'Prefer': 'return=representation' };

module.exports = async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const token = req.headers['x-access-token'];
    if (!validateToken(token)) return sendJSON(res, 401, { error: '인증이 필요합니다.' });
    if (!process.env.SUPABASE_URL) return sendJSON(res, 503, { error: 'Supabase 미설정' });

    const params     = new URL(req.url, 'http://x').searchParams;
    const id         = params.get('id');
    const customerId = params.get('customer_id');

    try {
        if (req.method === 'GET') {
            if (id) {
                const rows = await supaFetch(`/rest/v1/claim_history?id=eq.${id}&select=*`);
                return sendJSON(res, 200, rows[0] || null);
            }
            if (customerId) {
                const rows = await supaFetch(`/rest/v1/claim_history?customer_id=eq.${customerId}&order=claim_date.desc`);
                return sendJSON(res, 200, rows || []);
            }
            return sendJSON(res, 400, { error: 'customer_id 또는 id 필요' });
        }

        const body = JSON.parse(await readBody(req));

        if (req.method === 'POST') {
            const row = await supaFetch('/rest/v1/claim_history', {
                method: 'POST', body: JSON.stringify(body), headers: HEADERS_RETURN,
            });
            return sendJSON(res, 201, Array.isArray(row) ? row[0] : row);
        }

        if (req.method === 'PUT' || req.method === 'PATCH') {
            if (!id) return sendJSON(res, 400, { error: 'id 필요' });
            const row = await supaFetch(`/rest/v1/claim_history?id=eq.${id}`, {
                method: 'PATCH', body: JSON.stringify(body), headers: HEADERS_RETURN,
            });
            return sendJSON(res, 200, Array.isArray(row) ? row[0] : row);
        }

        if (req.method === 'DELETE') {
            if (!id) return sendJSON(res, 400, { error: 'id 필요' });
            await supaFetch(`/rest/v1/claim_history?id=eq.${id}`, { method: 'DELETE' });
            return sendJSON(res, 204, null);
        }

        sendJSON(res, 405, { error: 'Method not allowed' });
    } catch (err) {
        sendJSON(res, 500, { error: err.message });
    }
};
