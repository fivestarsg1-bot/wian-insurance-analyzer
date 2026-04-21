const https = require('https');
const { validateToken } = require('./_token');

function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end',  () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}

module.exports = async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');

    if (req.method !== 'POST') return res.status(405).end();

    const token = req.headers['x-access-token'] || (req.headers['authorization'] || '').replace('Bearer ', '');
    if (!validateToken(token)) {
        return res.status(401).json({ error: '인증이 필요합니다.' });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'ANTHROPIC_API_KEY 환경변수가 없습니다.' });
    }

    let body;
    try {
        const raw = req.body !== undefined
            ? (typeof req.body === 'string' ? req.body : JSON.stringify(req.body))
            : (await readBody(req)).toString();
        body = JSON.parse(raw);
    } catch (e) {
        return res.status(400).json({ error: '요청 파싱 오류' });
    }

    const { pdf, text } = body;

    let messages, extraHeaders = {};

    if (pdf) {
        // 스캔본: PDF를 document로 전달 → Claude 비전으로 읽기
        messages = [{
            role: 'user',
            content: [
                {
                    type: 'document',
                    source: { type: 'base64', media_type: 'application/pdf', data: pdf }
                },
                {
                    type: 'text',
                    text: '이 보험약관에서 보험금 지급사유와 면책조항만 추출하세요.\n반드시 JSON만 출력 (설명 금지).\n{"doc_name":"보험사+상품명","chunks":[{"section":"조항명","content":"내용(100자이내)"}]}'
                }
            ]
        }];
        extraHeaders['anthropic-beta'] = 'pdfs-2024-09-25';
    } else if (text) {
        // 텍스트 추출 성공: 텍스트로 전달
        messages = [{
            role: 'user',
            content: `다음 보험약관 텍스트에서 보험금 지급사유와 면책조항만 추출.\n반드시 JSON만 출력 (설명 금지).\n{"doc_name":"보험사+상품명","chunks":[{"section":"조항명","content":"내용(100자이내)"}]}\n\n${text}`
        }];
    } else {
        return res.status(400).json({ error: 'pdf 또는 text 필드가 필요합니다.' });
    }

    const reqBody = JSON.stringify({
        model: pdf ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        messages,
    });

    const bodyBuf = Buffer.from(reqBody);

    await new Promise((resolve) => {
        const options = {
            hostname: 'api.anthropic.com',
            path:     '/v1/messages',
            method:   'POST',
            headers: {
                'Content-Type':      'application/json',
                'Content-Length':    bodyBuf.length,
                'x-api-key':         apiKey,
                'anthropic-version': '2023-06-01',
                ...extraHeaders,
            },
        };

        const upstream = https.request(options, upRes => {
            let data = '';
            upRes.on('data', c => data += c);
            upRes.on('end', () => {
                let parsed;
                try { parsed = JSON.parse(data); } catch (e) {
                    res.status(502).json({ error: 'Anthropic 응답 파싱 실패' });
                    return resolve();
                }
                if (!upRes.statusCode || upRes.statusCode >= 400) {
                    res.status(upRes.statusCode || 502).json({ error: parsed.error?.message || '오류' });
                    return resolve();
                }
                const raw = parsed.content?.[0]?.text || '';
                const cleaned = raw.replace(/```json|```/g, '').trim();
                if (!cleaned.startsWith('{')) {
                    res.status(500).json({ error: 'JSON 응답 없음 — 약관 인식 불가' });
                    return resolve();
                }
                try {
                    res.json(JSON.parse(cleaned));
                } catch (e) {
                    res.status(500).json({ error: 'JSON 파싱 실패' });
                }
                resolve();
            });
        });

        upstream.on('error', err => {
            if (!res.headersSent) res.status(502).json({ error: `프록시 오류: ${err.message}` });
            resolve();
        });

        upstream.write(bodyBuf);
        upstream.end();
    });
};
