const { supaFetch, readBody, sendJSON } = require('./_rag');
const { validateToken } = require('./_token');

module.exports = async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');

    const token = req.headers['x-access-token'];
    if (!validateToken(token)) return sendJSON(res, 401, { error: '인증이 필요합니다.' });

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        if (req.method === 'GET') return sendJSON(res, 200, { docs: [] });
        return sendJSON(res, 500, { error: 'Supabase 환경변수가 설정되지 않았습니다.' });
    }

    try {
        if (req.method === 'GET') {
            const docs = await supaFetch('/rest/v1/rpc/list_policy_docs', {
                method: 'POST',
                body: JSON.stringify({}),
            });
            return sendJSON(res, 200, { docs: Array.isArray(docs) ? docs : [] });
        }

        if (req.method === 'POST') {
            const raw = await readBody(req);
            const { doc_id } = JSON.parse(raw);
            if (!doc_id) return sendJSON(res, 400, { error: 'doc_id 필수' });

            await supaFetch('/rest/v1/rpc/delete_policy_doc', {
                method: 'POST',
                body: JSON.stringify({ target_doc_id: doc_id }),
            });
            return sendJSON(res, 200, { ok: true });
        }

        sendJSON(res, 405, { error: 'Method not allowed' });
    } catch (err) {
        sendJSON(res, 500, { error: err.message });
    }
};
