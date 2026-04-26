// api/anime.js
// Используем встроенный fetch (Node.js 18+ на Vercel)

const YOUR_HIANIME_API = 'https://dssdsds.vercel.app'; // твой рабочий парсер

async function safeFetch(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`External API ${res.status}`);
    return res.json();
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

export default async function handler(req, res) {
  // CORS и логирование
  res.setHeader('Access-Control-Allow-Origin', '*');
  console.log(`[API] Request: action=${req.query.action}, query=${req.query.query}`);

  const { action, query } = req.query;
  if (!action) {
    return res.status(400).json({ error: 'action required' });
  }

  try {
    // ── ПОИСК ──
    if (action === 'search') {
      const data = await safeFetch(`${YOUR_HIANIME_API}/search?keyword=${encodeURIComponent(query || '')}`);
      const results = (Array.isArray(data) ? data : []).map(item => ({
        id: item.id,
        title: item.title,
        image: item.image || '',
      }));
      return res.status(200).json({ results });
    }

    // ── ЭПИЗОДЫ ──
    if (action === 'info') {
      const data = await safeFetch(`${YOUR_HIANIME_API}/episodes/${encodeURIComponent(query)}`);
      const episodes = (Array.isArray(data) ? data : []).map(ep => ({
        id: ep.episodeId,
        number: ep.number,
      }));
      return res.status(200).json({ episodes });
    }

    // ── ВИДЕО ──
    if (action === 'watch') {
      const servers = await safeFetch(`${YOUR_HIANIME_API}/servers?id=${encodeURIComponent(query)}`);
      if (!Array.isArray(servers) || !servers.length) {
        return res.status(404).json({ error: 'servers not found' });
      }
      const server = servers[0].serverName;
      const stream = await safeFetch(
        `${YOUR_HIANIME_API}/stream?id=${encodeURIComponent(query)}&type=sub&server=${encodeURIComponent(server)}`
      );
      if (!stream.link) return res.status(404).json({ error: 'stream link not found' });
      return res.status(200).json({ sources: [{ file: stream.link, quality: 'auto', type: 'hls' }] });
    }

    return res.status(400).json({ error: 'unknown action' });
  } catch (error) {
    console.error(`[API] Error: ${error.message}`);
    return res.status(500).json({ error: error.message });
  }
}
