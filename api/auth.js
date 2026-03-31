const { makeToken } = require('./_token');

function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end',  () => resolve(Buffer.concat(chunks).toString()));
        req.on('error', reject);
    });
}

module.exports = async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');

    if (req.method !== 'POST') {
        return res.status(405).end();
    }

    let password = '';
    try {
        const raw = req.body !== undefined
            ? (typeof req.body === 'object' ? JSON.stringify(req.body) : String(req.body))
            : await readBody(req);
        password = JSON.parse(raw || '{}').password || '';
    } catch {
        return res.status(400).json({ error: '잘못된 요청입니다.' });
    }

    const sitePassword = process.env.SITE_PASSWORD;

    // SITE_PASSWORD 미설정 시 → 비밀번호 없이 접속 허용
    if (sitePassword && password !== sitePassword) {
        // 무차별 대입 방지: 응답 지연
        await new Promise(r => setTimeout(r, 800));
        return res.status(401).json({ error: '비밀번호가 올바르지 않습니다.' });
    }

    return res.status(200).json({ token: makeToken() });
};
