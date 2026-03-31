// 공유 토큰 유틸리티 — Vercel과 로컬 server.js 양쪽에서 require()로 사용
const crypto = require('crypto');

function makeToken() {
    const secret   = process.env.TOKEN_SECRET   || 'local-dev-secret';
    const password = process.env.SITE_PASSWORD  || '';
    return crypto
        .createHmac('sha256', secret)
        .update(password + ':손해사정사')
        .digest('hex');
}

function validateToken(token) {
    if (!token) return false;
    // timing-safe compare
    const expected = Buffer.from(makeToken());
    const provided = Buffer.from(token.length === expected.length ? token : makeToken() + ' ');
    try {
        return crypto.timingSafeEqual(expected, provided);
    } catch {
        return false;
    }
}

module.exports = { makeToken, validateToken };
