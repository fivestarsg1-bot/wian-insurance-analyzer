const { validateToken } = require('./_token');

module.exports = (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');

    if (req.method !== 'GET') return res.status(405).end();

    const token = req.headers['x-access-token'];
    if (!validateToken(token)) {
        res.writeHead(401);
        return res.end(JSON.stringify({ error: '인증이 필요합니다.' }));
    }

    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
        res.writeHead(500);
        return res.end(JSON.stringify({ error: 'API 키 없음' }));
    }

    res.writeHead(200);
    res.end(JSON.stringify({ key }));
};
