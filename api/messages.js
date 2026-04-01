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

function proxyToAnthropic(apiKey, bodyBuffer, res) {
    const options = {
        hostname: 'api.anthropic.com',
        path:     '/v1/messages',
        method:   'POST',
        headers: {
            'Content-Type':      'application/json',
            'Content-Length':    bodyBuffer.length,
            'x-api-key':         apiKey,
            'anthropic-version': '2023-06-01',
        },
    };

    const upstream = https.request(options, upRes => {
        res.writeHead(upRes.statusCode, { 'Content-Type': 'application/json' });
        upRes.pipe(res);
    });

    upstream.on('error', err => {
        if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: `프록시 오류: ${err.message}` } }));
    });

    upstream.write(bodyBuffer);
    upstream.end();
}

module.exports = async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');

    if (req.method !== 'POST') return res.status(405).end();

    // 1. 접속 토큰 검증
    const token = req.headers['x-access-token'];
    if (!validateToken(token)) {
        res.writeHead(401);
        return res.end(JSON.stringify({ error: { message: '인증이 필요합니다. 다시 로그인해주세요.' } }));
    }

    // 2. API 키 확인
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        res.writeHead(500);
        return res.end(JSON.stringify({ error: { message: 'ANTHROPIC_API_KEY 환경변수가 없습니다.' } }));
    }

    // 3. Anthropic 프록시 (비스트리밍)
    try {
        const body = req.body !== undefined
            ? Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body))
            : await readBody(req);

        proxyToAnthropic(apiKey, body, res);
    } catch (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: { message: err.message } }));
    }
};
