const { textToVector, supaFetch, readBody, sendJSON } = require('./_rag');

module.exports = async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') return sendJSON(res, 405, { error: 'Method not allowed' });

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return sendJSON(res, 200, { chunks: [] });
    }

    try {
        const raw = await readBody(req);
        const { query, top_k = 4 } = JSON.parse(raw);
        if (!query) return sendJSON(res, 400, { error: 'query 필수' });

        const embedding = `[${textToVector(query).join(',')}]`;
        const results = await supaFetch('/rest/v1/rpc/match_precedent_chunks', {
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
