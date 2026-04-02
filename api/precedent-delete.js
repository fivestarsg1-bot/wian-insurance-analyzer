const { supaFetch, readBody, sendJSON } = require('./_rag');
const { validateToken } = require('./_token');

module.exports = async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') return sendJSON(res, 405, { error: 'Method not allowed' });

    const token = req.headers['x-access-token'];
    if (!validateToken(token)) return sendJSON(res, 401, { error: '인증이 필요합니다.' });

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return sendJSON(res, 500, { error: 'Supabase 환경변수가 설정되지 않았습니다.' });
    }

    try {
        const raw = await readBody(req);
        const { doc_id } = JSON.parse(raw);
        if (!doc_id) return sendJSON(res, 400, { error: 'doc_id 필수' });

        await supaFetch('/rest/v1/rpc/delete_precedent_doc', {
            method: 'POST',
            body: JSON.stringify({ target_doc_id: doc_id }),
        });

        sendJSON(res, 200, { ok: true });
    } catch (err) {
        sendJSON(res, 500, { error: err.message });
    }
};
