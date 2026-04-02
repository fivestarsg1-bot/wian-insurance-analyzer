const { textToVector, supaFetch, readBody, sendJSON } = require('./_rag');
const { validateToken } = require('./_token');

module.exports = async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') return sendJSON(res, 405, { error: 'Method not allowed' });

    const token = req.headers['x-access-token'];
    if (!validateToken(token)) return sendJSON(res, 401, { error: '인증이 필요합니다.' });

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return sendJSON(res, 200, { chunks: [] }); // Supabase 미설정 시 빈 결과
    }

    try {
        const raw = await readBody(req);
        const { query, top_k = 5 } = JSON.parse(raw);
        if (!query) return sendJSON(res, 400, { error: 'query 필수' });

        const embedding = `[${textToVector(query).join(',')}]`;
        const results = await supaFetch('/rest/v1/rpc/match_policy_chunks', {
            method: 'POST',
            body: JSON.stringify({
                query_embedding: embedding,
                match_count: top_k,
                match_threshold: 0.1,
            }),
        });

        sendJSON(res, 200, { chunks: Array.isArray(results) ? results : [] });
    } catch (err) {
        sendJSON(res, 500, { error: err.message });
    }
};
