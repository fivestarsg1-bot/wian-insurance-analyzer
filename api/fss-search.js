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

    const rowPattern = /<tr[^>]*>[\s\S]*?<\/tr>/gi;
    const rows = html.match(rowPattern) || [];

    for (const row of rows) {
      const linkMatch = row.match(/href="([^"]*fncCnflCase[^"]*)"[^>]*>([^<]+)</);
      const dateMatch = row.match(/(\d{4}[-\.]\d{2}[-\.]\d{2})/);
      const caseNoMatch = row.match(/(\d{4}-\d+)/);

      if (linkMatch) {
        const href = linkMatch[1];
        cases.push({
          title: linkMatch[2].trim(),
          url: href.startsWith('http') ? href : 'https://www.fss.or.kr' + href,
          date: dateMatch ? dateMatch[1] : '',
          caseNo: caseNoMatch ? caseNoMatch[1] : ''
        });
      }
    }

    const unique = cases
      .filter((c, i) => cases.findIndex(x => x.title === c.title) === i)
      .filter(c => c.title.length > 2)
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
