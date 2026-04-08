const { supaFetch, sendJSON, readBody } = require('./_rag');
const { validateToken } = require('./_token');

const HEADERS_RETURN = { 'Prefer': 'return=representation' };

module.exports = async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const token = req.headers['x-access-token'];
    if (!validateToken(token)) return sendJSON(res, 401, { error: '인증이 필요합니다.' });
    if (!process.env.SUPABASE_URL) return sendJSON(res, 503, { error: 'Supabase 미설정' });

    const id = req.query?.id || new URL(req.url, 'http://x').searchParams.get('id');

    try {
        if (req.method === 'GET') {
            if (id) {
                const rows = await supaFetch(`/rest/v1/customers?id=eq.${id}&select=*`);
                return sendJSON(res, 200, rows[0] || null);
            }
            // 목록 + 계약 수, 최근 청구일 집계
            const q = req.query?.q || new URL(req.url, 'http://x').searchParams.get('q') || '';
            const filter = q
                ? `&or=(name.ilike.*${encodeURIComponent(q)}*,phone.ilike.*${encodeURIComponent(q)}*)`
                : '';
            const customers = await supaFetch(`/rest/v1/customers?select=*&order=updated_at.desc${filter}`);
            // 계약 수
            const contracts = await supaFetch('/rest/v1/insurance_contracts?select=id,customer_id');
            const claims    = await supaFetch('/rest/v1/claim_history?select=customer_id,claim_date&order=claim_date.desc');
            const contractCnt = {};
            for (const c of (contracts || [])) contractCnt[c.customer_id] = (contractCnt[c.customer_id] || 0) + 1;
            const lastClaim = {};
            for (const cl of (claims || [])) if (!lastClaim[cl.customer_id]) lastClaim[cl.customer_id] = cl.claim_date;
            const rows = (customers || []).map(c => ({
                ...c,
                contract_count: contractCnt[c.id] || 0,
                last_claim_date: lastClaim[c.id] || null,
            }));
            return sendJSON(res, 200, rows);
        }

        const body = JSON.parse(await readBody(req));

        if (req.method === 'POST') {
            const row = await supaFetch('/rest/v1/customers', {
                method: 'POST', body: JSON.stringify(body), headers: HEADERS_RETURN,
            });
            return sendJSON(res, 201, Array.isArray(row) ? row[0] : row);
        }

        if (req.method === 'PUT' || req.method === 'PATCH') {
            if (!id) return sendJSON(res, 400, { error: 'id 필요' });
            const row = await supaFetch(`/rest/v1/customers?id=eq.${id}`, {
                method: 'PATCH', body: JSON.stringify(body), headers: HEADERS_RETURN,
            });
            return sendJSON(res, 200, Array.isArray(row) ? row[0] : row);
        }

        if (req.method === 'DELETE') {
            if (!id) return sendJSON(res, 400, { error: 'id 필요' });
            await supaFetch(`/rest/v1/customers?id=eq.${id}`, { method: 'DELETE' });
            return sendJSON(res, 204, null);
        }

        sendJSON(res, 405, { error: 'Method not allowed' });
    } catch (err) {
        sendJSON(res, 500, { error: err.message });
    }
};
