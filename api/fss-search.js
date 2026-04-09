module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { keyword } = req.query;
  if (!keyword) return res.status(400).json({ error: 'keyword required' });

  // 검색 결과 페이지 URL (더보기 링크용)
  const searchUrl = `https://www.fss.or.kr/fss/job/fncCnflCase/list.do?menuNo=201195&searchWrd=${encodeURIComponent(keyword)}&pageIndex=1`;

  try {
    const FSS_LIST = 'https://www.fss.or.kr/fss/job/fncCnflCase/list.do';
    const commonHeaders = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'ko-KR,ko;q=0.9',
    };

    // GET 먼저 → 세션 쿠키 획득 (금감원 POST 필터링이 세션을 요구하는 경우 대비)
    const getRes = await fetch(`${FSS_LIST}?menuNo=201195`, { headers: commonHeaders });
    const rawCookie = getRes.headers.get('set-cookie') || '';
    const sessionCookie = rawCookie.split(';')[0]; // "JSESSIONID=xxxx" 부분만

    const response = await fetch(FSS_LIST, {
      method: 'POST',
      headers: {
        ...commonHeaders,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': `${FSS_LIST}?menuNo=201195`,
        ...(sessionCookie ? { 'Cookie': sessionCookie } : {}),
      },
      body: new URLSearchParams({
        menuNo: '201195',
        searchWrd: keyword,
        searchCnd: '1',
        pageIndex: '1'
      }).toString()
    });

    const html = await response.text();
    const cases = [];

    // tbody 내 tr 행 추출
    const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/);
    const tbody = tbodyMatch ? tbodyMatch[1] : '';

    const rowPattern = /<tr>([\s\S]*?)<\/tr>/gi;
    let rowMatch;
    while ((rowMatch = rowPattern.exec(tbody)) !== null) {
      const row = rowMatch[1];
      // 제목 링크: href="./view.do?caseSlno=NNN&..."
      const linkMatch = row.match(/href="(\.\/view\.do\?[^"]+)"[^>]*>\s*([^<]{3,})\s*<\/a>/);
      if (!linkMatch) continue;

      const href  = linkMatch[1].replace(/&amp;/g, '&');
      const title = linkMatch[2].trim();
      const dateMatch = row.match(/(\d{4}-\d{2}-\d{2})/);

      cases.push({
        title,
        url: 'https://www.fss.or.kr/fss/job/fncCnflCase/' + href.replace(/^\.\//, ''),
        date: dateMatch ? dateMatch[1] : ''
      });
    }

    const unique = cases
      .filter((c, i) => cases.findIndex(x => x.title === c.title) === i)
      .slice(0, 5);

    res.json({
      keyword,
      total: unique.length,
      cases: unique,
      searchUrl
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
