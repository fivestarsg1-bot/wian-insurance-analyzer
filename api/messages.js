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

// Anthropic SSE 스트림을 그대로 클라이언트에 파이프
function proxyStream(apiKey, bodyBuffer, res) {
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
        // 오류 응답(4xx/5xx)은 JSON으로 그대로 반환
        if (upRes.statusCode >= 400) {
            let raw = '';
            upRes.on('data', c => raw += c);
            upRes.on('end', () => {
                res.writeHead(upRes.statusCode, { 'Content-Type': 'application/json' });
                res.end(raw);
            });
            return;
        }

        // 성공 응답: SSE 스트림을 그대로 파이프
        res.writeHead(200, {
            'Content-Type':  'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection':    'keep-alive',
            'X-Accel-Buffering': 'no', // nginx 버퍼링 비활성화
        });
        upRes.pipe(res);
    });

    upstream.on('error', err => {
        if (!res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'application/json' });
        }
        res.end(JSON.stringify({ error: { message: `프록시 오류: ${err.message}` } }));
    });

    upstream.write(bodyBuffer);
    upstream.end();
}

module.exports = async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');

    if (req.method !== 'POST') return res.status(405).end();

    // 1. 접속 토큰 검증
    const token = req.headers['x-access-token'];
    if (!validateToken(token)) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: { message: '인증이 필요합니다. 다시 로그인해주세요.' } }));
    }

    // 2. API 키 확인
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: { message: 'ANTHROPIC_API_KEY 환경변수가 없습니다.' } }));
    }

    // 3. 요청 바디에 stream: true 주입
    try {
        const raw = req.body !== undefined
            ? Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body))
            : await readBody(req);

        const bodyObj = JSON.parse(raw.toString());
        bodyObj.stream = true;                      // 스트리밍 강제 활성화
        const bodyBuffer = Buffer.from(JSON.stringify(bodyObj));

        proxyStream(apiKey, bodyBuffer, res);
    } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: err.message } }));
    }
};
