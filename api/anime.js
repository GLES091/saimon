// api/anime.js
// Можно быстро переключиться на свой API, заменив BASE_URL
const BASE_URL = 'https://aniwatch-api-rouge.vercel.app'; // или твой https://dssdsds.vercel.app

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
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`External API ${res.status}: ${text.slice(0, 100)}`);
    }
    return res.json();
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { action, query } = req.query;

  console.log(`[API] action=${action}, query=${query}`);

  if (!action) return res.status(400).json({ error: 'action required' });

  try {
    if (action === 'search') {
      const url = `${BASE_URL}/search?keyword=${encodeURIComponent(query || '')}`;
      console.log('[API] GET', url);
      const data = await safeFetch(url);
      const results = (Array.isArray(data) ? data : []).map(item => ({
        id: item.id,
        title: item.title,
        image: item.image || '',
      }));
      return res.status(200).json({ results });
    }

    if (action === 'info') {
      const url = `${BASE_URL}/episodes/${encodeURIComponent(query)}`;
      console.log('[API] GET', url);
      const data = await safeFetch(url);
      const episodes = (Array.isArray(data) ? data : []).map(ep => ({
        id: ep.episodeId,
        number: ep.number,
      }));
      return res.status(200).json({ episodes });
    }

    if (action === 'watch') {
      // Получаем сервера
      const servUrl = `${BASE_URL}/servers?id=${encodeURIComponent(query)}`;
      console.log('[API] GET', servUrl);
      const servers = await safeFetch(servUrl);
      if (!Array.isArray(servers) || servers.length === 0) {
        return res.status(404).json({ error: 'servers not found' });
      }
      const server = servers[0].serverName;

      // Получаем стрим
      const streamUrl = `${BASE_URL}/stream?id=${encodeURIComponent(query)}&type=sub&server=${encodeURIComponent(server)}`;
      console.log('[API] GET', streamUrl);
      const stream = await safeFetch(streamUrl);
      if (!stream.link) return res.status(404).json({ error: 'stream link not found' });

      return res.status(200).json({ sources: [{ file: stream.link, quality: 'auto', type: 'hls' }] });
    }

    return res.status(400).json({ error: 'unknown action' });
  } catch (error) {
    console.error('[API] Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
}
