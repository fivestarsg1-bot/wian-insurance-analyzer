// ─── .env 파일 로드 (로컬 개발용) ───────────────────────────
const fs   = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf8')
        .split('\n')
        .forEach(line => {
            const clean = line.trim();
            if (!clean || clean.startsWith('#')) return;
            const eq = clean.indexOf('=');
            if (eq === -1) return;
            const key = clean.slice(0, eq).trim();
            const val = clean.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
            if (key && !(key in process.env)) process.env[key] = val;
        });
    console.log('✓ .env 파일 로드됨');
}

// ─── 의존성 ──────────────────────────────────────────────────
const http  = require('http');
const https = require('https');
const { makeToken, validateToken } = require('./api/_token');

const PORT    = process.env.PORT || 3000;
const STATIC  = path.join(__dirname, 'public');

// ─── 요청 바디 읽기 ──────────────────────────────────────────
function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end',  () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}

// ─── Anthropic 스트리밍 프록시 ───────────────────────────────
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
        if (upRes.statusCode >= 400) {
            let raw = '';
            upRes.on('data', c => raw += c);
            upRes.on('end', () => {
                res.writeHead(upRes.statusCode, { 'Content-Type': 'application/json' });
                res.end(raw);
            });
            return;
        }
        res.writeHead(200, {
            'Content-Type':      'text/event-stream',
            'Cache-Control':     'no-cache',
            'Connection':        'keep-alive',
            'X-Accel-Buffering': 'no',
        });
        upRes.pipe(res);
    });

    upstream.on('error', err => {
        if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: `프록시 오류: ${err.message}` } }));
    });

    upstream.write(bodyBuffer);
    upstream.end();
}

// ─── 정적 파일 서빙 ─────────────────────────────────────────
const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js':   'application/javascript',
    '.css':  'text/css',
    '.json': 'application/json',
    '.png':  'image/png',
    '.ico':  'image/x-icon',
};

function serveStatic(urlPath, res) {
    const decoded  = decodeURIComponent(urlPath === '/' ? '/index.html' : urlPath);
    const filePath = path.normalize(path.join(STATIC, decoded));

    if (!filePath.startsWith(STATIC + path.sep) && filePath !== path.join(STATIC, 'index.html')) {
        res.writeHead(403); res.end('Forbidden'); return;
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            // SPA fallback
            fs.readFile(path.join(STATIC, 'index.html'), (e2, d2) => {
                if (e2) { res.writeHead(404); res.end('Not found'); return; }
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(d2);
            });
            return;
        }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
        res.end(data);
    });
}

// ─── 서버 ────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
    const { method, url: reqUrl } = req;
    console.log(`[${new Date().toLocaleTimeString('ko-KR')}] ${method} ${reqUrl}`);

    res.setHeader('Cache-Control', 'no-store');

    // POST /api/auth — 비밀번호 검증
    if (method === 'POST' && reqUrl === '/api/auth') {
        res.setHeader('Content-Type', 'application/json');
        try {
            const raw = (await readBody(req)).toString();
            const { password = '' } = JSON.parse(raw || '{}');
            const sitePassword = process.env.SITE_PASSWORD;

            if (sitePassword && password !== sitePassword) {
                await new Promise(r => setTimeout(r, 800));
                res.writeHead(401);
                res.end(JSON.stringify({ error: '비밀번호가 올바르지 않습니다.' }));
                return;
            }

            res.writeHead(200);
            res.end(JSON.stringify({ token: makeToken() }));
        } catch (err) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: '잘못된 요청입니다.' }));
        }
        return;
    }

    // POST /api/messages — Anthropic 프록시
    if (method === 'POST' && reqUrl === '/api/messages') {
        res.setHeader('Content-Type', 'application/json');

        const token = req.headers['x-access-token'];
        if (!validateToken(token)) {
            res.writeHead(401);
            res.end(JSON.stringify({ error: { message: '인증이 필요합니다. 다시 로그인해주세요.' } }));
            return;
        }

        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: { message: 'ANTHROPIC_API_KEY 환경변수가 없습니다. .env 파일을 확인해주세요.' } }));
            return;
        }

        try {
            const raw = await readBody(req);
            const bodyObj = JSON.parse(raw.toString());
            bodyObj.stream = true;
            proxyToAnthropic(apiKey, Buffer.from(JSON.stringify(bodyObj)), res);
        } catch (err) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: { message: err.message } }));
        }
        return;
    }

    // GET — 정적 파일
    if (method === 'GET') { serveStatic(reqUrl, res); return; }

    res.writeHead(405); res.end('Method Not Allowed');
});

server.listen(PORT, '127.0.0.1', () => {
    const hasPw  = !!process.env.SITE_PASSWORD;
    const hasKey = !!process.env.ANTHROPIC_API_KEY;
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  🛡️  내 손안의 손해사정사');
    console.log(`  👉  http://localhost:${PORT}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  API 키:   ${hasKey  ? '✓ 설정됨' : '✗ 없음 (.env 파일 확인)'}`);
    console.log(`  비밀번호: ${hasPw   ? '✓ 설정됨' : '미설정 (비밀번호 없이 접속)'}`);
    console.log('  종료: Ctrl+C\n');
});

server.on('error', err => {
    if (err.code === 'EADDRINUSE') {
        console.error(`\n❌ 포트 ${PORT}이 이미 사용 중입니다.`);
        console.error(`   lsof -ti:${PORT} | xargs kill\n`);
    } else {
        console.error('서버 오류:', err);
    }
    process.exit(1);
});
