const { supaFetch, sendJSON, readBody } = require('./_rag');
const { validateToken } = require('./_token');

const HEADERS_RETURN = { 'Prefer': 'return=representation' };

module.exports = async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const token = req.headers['x-access-token'];
    if (!validateToken(token)) return sendJSON(res, 401, { error: '인증이 필요합니다.' });
    if (!process.env.SUPABASE_URL) return sendJSON(res, 503, { error: 'Supabase 미설정' });

    const params = new URL(req.url, 'http://x').searchParams;
    const id         = params.get('id');
    const customerId = params.get('customer_id');
    const contractId = params.get('contract_id'); // for coverage_details

    try {
        if (req.method === 'GET') {
            // coverage_details 조회
            if (contractId) {
                const rows = await supaFetch(`/rest/v1/coverage_details?contract_id=eq.${contractId}&order=category.asc,created_at.asc`);
                return sendJSON(res, 200, rows || []);
            }
            // 단일 계약
            if (id) {
                const rows = await supaFetch(`/rest/v1/insurance_contracts?id=eq.${id}&select=*`);
                return sendJSON(res, 200, rows[0] || null);
            }
            // 고객별 계약 목록
            if (customerId) {
                const rows = await supaFetch(`/rest/v1/insurance_contracts?customer_id=eq.${customerId}&order=contract_date.desc`);
                // 각 계약에 coverage_details 포함
                const allCov = await supaFetch(`/rest/v1/coverage_details?select=*&order=category.asc`);
                const covMap = {};
                for (const c of (allCov || [])) {
                    if (!covMap[c.contract_id]) covMap[c.contract_id] = [];
                    covMap[c.contract_id].push(c);
                }
                return sendJSON(res, 200, (rows || []).map(r => ({ ...r, coverage: covMap[r.id] || [] })));
            }
            return sendJSON(res, 400, { error: 'customer_id 또는 id 필요' });
        }

        const body = JSON.parse(await readBody(req));

        if (req.method === 'POST') {
            // coverage_details 저장
            if (body._type === 'coverage') {
                const { _type, ...data } = body;
                const row = await supaFetch('/rest/v1/coverage_details', {
                    method: 'POST', body: JSON.stringify(data), headers: HEADERS_RETURN,
                });
                return sendJSON(res, 201, Array.isArray(row) ? row[0] : row);
            }
            // 계약 저장 (coverage 배열이 있으면 함께 처리)
            const { coverage, ...contractData } = body;
            const row = await supaFetch('/rest/v1/insurance_contracts', {
                method: 'POST', body: JSON.stringify(contractData), headers: HEADERS_RETURN,
            });
            const contract = Array.isArray(row) ? row[0] : row;
            if (coverage?.length && contract?.id) {
                const covRows = coverage.map(c => ({ ...c, contract_id: contract.id }));
                await supaFetch('/rest/v1/coverage_details', {
                    method: 'POST', body: JSON.stringify(covRows), headers: { 'Prefer': 'return=minimal' },
                });
            }
            return sendJSON(res, 201, contract);
        }

        if (req.method === 'PUT' || req.method === 'PATCH') {
            if (!id) return sendJSON(res, 400, { error: 'id 필요' });
            const { coverage, _type, ...data } = body;
            // coverage_details 업데이트 (PUT)
            if (_type === 'coverage') {
                const row = await supaFetch(`/rest/v1/coverage_details?id=eq.${id}`, {
                    method: 'PATCH', body: JSON.stringify(data), headers: HEADERS_RETURN,
                });
                return sendJSON(res, 200, Array.isArray(row) ? row[0] : row);
            }
            const row = await supaFetch(`/rest/v1/insurance_contracts?id=eq.${id}`, {
                method: 'PATCH', body: JSON.stringify(data), headers: HEADERS_RETURN,
            });
            return sendJSON(res, 200, Array.isArray(row) ? row[0] : row);
        }

        if (req.method === 'DELETE') {
            if (!id) return sendJSON(res, 400, { error: 'id 필요' });
            const type = params.get('type');
            const table = type === 'coverage' ? 'coverage_details' : 'insurance_contracts';
            await supaFetch(`/rest/v1/${table}?id=eq.${id}`, { method: 'DELETE' });
            return sendJSON(res, 204, null);
        }

        sendJSON(res, 405, { error: 'Method not allowed' });
    } catch (err) {
        sendJSON(res, 500, { error: err.message });
    }
};
