const { textToVector, chunkText, supaFetch, readBody, sendJSON } = require('./_rag');
const { validateToken } = require('./_token');

module.exports = async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') return sendJSON(res, 405, { error: 'Method not allowed' });

    const token = req.headers['x-access-token'];
    if (!validateToken(token)) return sendJSON(res, 401, { error: '인증이 필요합니다.' });

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return sendJSON(res, 500, { error: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 없습니다.' });
    }

    try {
        const raw = await readBody(req);
        const { doc_id, doc_name, text: rawText } = JSON.parse(raw);
        if (!doc_id || !doc_name || !rawText) return sendJSON(res, 400, { error: '필수 필드 누락 (doc_id, doc_name, text)' });
        const text = rawText.replace(/\u0000/g, '');

        // 기존 동일 문서 삭제 (덮어쓰기)
        await supaFetch('/rest/v1/rpc/delete_policy_doc', {
            method: 'POST',
            body: JSON.stringify({ target_doc_id: doc_id }),
        }).catch(() => {}); // 없으면 무시

        // 청크 분할 + 임베딩 생성
        const chunks = chunkText(text);
        const rows = chunks.map((chunk_text, chunk_index) => ({
            doc_id,
            doc_name,
            chunk_index,
            chunk_text: chunk_text.replace(/\u0000/g, ''),
            embedding: `[${textToVector(chunk_text).join(',')}]`,
        }));

        // Supabase에 100개씩 배치 insert
        for (let i = 0; i < rows.length; i += 100) {
            await supaFetch('/rest/v1/policy_chunks', {
                method: 'POST',
                headers: { Prefer: 'return=minimal' },
                body: JSON.stringify(rows.slice(i, i + 100)),
            });
        }

        sendJSON(res, 200, { ok: true, chunks: chunks.length });
    } catch (err) {
        sendJSON(res, 500, { error: err.message });
    }
};
