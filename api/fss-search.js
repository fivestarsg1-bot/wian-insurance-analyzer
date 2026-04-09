module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { keyword } = req.query;
  if (!keyword) return res.status(400).json({ error: 'keyword required' });

  try {
    const url = `https://www.fss.or.kr/fss/job/fncCnflCase/list.do?menuNo=201195&searchKeyword=${encodeURIComponent(keyword)}&pageIndex=1`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; InsuranceAnalyzer/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ko-KR,ko;q=0.9'
      }
    });

    const html = await response.text();
    const cases = [];

    // tbody 내 tr 행 추출
    const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/);
    const tbody = tbodyMatch ? tbodyMatch[1] : html;

    // 각 행에서 제목 링크(./view.do)와 날짜 추출
    const rowPattern = /<tr>([\s\S]*?)<\/tr>/gi;
    let rowMatch;
    while ((rowMatch = rowPattern.exec(tbody)) !== null) {
      const row = rowMatch[1];
      // 제목 링크: href="./view.do?caseSlno=NNN&..."
      const linkMatch = row.match(/href="(\.\/view\.do\?[^"]+)"[^>]*>\s*([^<]{3,})\s*<\/a>/);
      if (!linkMatch) continue;

      const href  = linkMatch[1].replace(/&amp;/g, '&');
      const title = linkMatch[2].trim();
      // 날짜: YYYY-MM-DD 형태의 td
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
      searchUrl: url
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
