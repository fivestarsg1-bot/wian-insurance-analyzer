const https = require('https');
const { validateToken } = require('./_token');

function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end',  () => resolve(Buffer.concat(chunks).toString()));
        req.on('error', reject);
    });
}

module.exports = async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');

    if (req.method !== 'POST') return res.status(405).end();

    const token = req.headers['x-access-token'];
    if (!validateToken(token)) {
        res.writeHead(401);
        return res.end(JSON.stringify({ error: '인증이 필요합니다.' }));
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        res.writeHead(500);
        return res.end(JSON.stringify({ error: 'ANTHROPIC_API_KEY 환경변수가 없습니다.' }));
    }

    let pdf, filename;
    try {
        const raw = req.body !== undefined
            ? (typeof req.body === 'string' ? req.body : JSON.stringify(req.body))
            : await readBody(req);
        ({ pdf, filename } = JSON.parse(raw));
        if (!pdf) throw new Error('pdf 필드 누락');
    } catch (e) {
        res.writeHead(400);
        return res.end(JSON.stringify({ error: e.message }));
    }

    const bodyObj = {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [{
            role: 'user',
            content: [
                { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdf } },
                { type: 'text', text: '이 보험 약관에서 보험금 지급사유, 면책조항, 수술 정의, 진단 정의, 실손 지급기준 조항만 추출해줘.\n{"doc_name":"보험사+상품명","chunks":[{"section":"조항명","content":"내용"}]}\nJSON만 출력.' }
            ]
        }]
    };
    const bodyBuf = Buffer.from(JSON.stringify(bodyObj));

    const options = {
        hostname: 'api.anthropic.com',
        path:     '/v1/messages',
        method:   'POST',
        headers: {
            'Content-Type':      'application/json',
            'Content-Length':    bodyBuf.length,
            'x-api-key':         apiKey,
            'anthropic-version': '2023-06-01',
        },
    };

    const upstream = https.request(options, upRes => {
        let data = '';
        upRes.on('data', c => data += c);
        upRes.on('end', () => {
            try {
                const json = JSON.parse(data);
                if (upRes.statusCode !== 200) {
                    res.writeHead(500);
                    return res.end(JSON.stringify({ error: json.error?.message || 'Anthropic 오류' }));
                }
                const text = json.content[0].text.replace(/```json|```/g, '').trim();
                const parsed = JSON.parse(text);
                res.writeHead(200);
                res.end(JSON.stringify(parsed));
            } catch (e) {
                res.writeHead(500);
                res.end(JSON.stringify({ error: 'JSON 파싱 실패: ' + e.message }));
            }
        });
    });

    upstream.on('error', err => {
        if (!res.headersSent) res.writeHead(502);
        res.end(JSON.stringify({ error: '프록시 오류: ' + err.message }));
    });

    upstream.write(bodyBuf);
    upstream.end();
};
