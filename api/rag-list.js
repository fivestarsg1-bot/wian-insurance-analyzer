const { supaFetch, sendJSON } = require('./_rag');
const { validateToken } = require('./_token');

module.exports = async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET') return sendJSON(res, 405, { error: 'Method not allowed' });

    const token = req.headers['x-access-token'];
    if (!validateToken(token)) return sendJSON(res, 401, { error: '인증이 필요합니다.' });

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return sendJSON(res, 200, { docs: [] });
    }

    try {
        const docs = await supaFetch('/rest/v1/rpc/list_policy_docs', {
            method: 'POST',
            body: JSON.stringify({}),
        });
        sendJSON(res, 200, { docs: Array.isArray(docs) ? docs : [] });
    } catch (err) {
        sendJSON(res, 500, { error: err.message });
    }
};
