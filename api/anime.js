// api/anime.js – прокси для твоего HiAnime API

const BASE = 'https://dssdsds.vercel.app'; // твой API

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { action, query } = req.query;
  if (!action) return res.status(400).json({ error: 'action required' });

  try {
    // Поиск аниме
    if (action === 'search') {
      const apiRes = await fetch(`${BASE}/search?keyword=${encodeURIComponent(query || '')}`);
      const data = await apiRes.json();
      const results = (Array.isArray(data) ? data : []).map(item => ({
        id: item.id,
        title: item.title,
        image: item.image || '',
      }));
      return res.status(200).json({ results });
    }

    // Получение эпизодов
    if (action === 'info') {
      const apiRes = await fetch(`${BASE}/episodes/${encodeURIComponent(query)}`);
      const data = await apiRes.json();
      const episodes = (Array.isArray(data) ? data : []).map(ep => ({
        id: ep.episodeId,
        number: ep.number,
      }));
      return res.status(200).json({ episodes });
    }

    // Получение видео
    if (action === 'watch') {
      // 1. Получить сервера
      const serverRes = await fetch(`${BASE}/servers?id=${encodeURIComponent(query)}`);
      const servers = await serverRes.json();
      if (!Array.isArray(servers) || servers.length === 0) {
        return res.status(404).json({ error: 'servers not found' });
      }
      const server = servers[0].serverName;

      // 2. Получить стрим
      const streamRes = await fetch(
        `${BASE}/stream?id=${encodeURIComponent(query)}&type=sub&server=${encodeURIComponent(server)}`
      );
      const stream = await streamRes.json();
      if (!stream.link) {
        return res.status(404).json({ error: 'stream link not found' });
      }

      return res.status(200).json({
        sources: [{ file: stream.link, quality: 'auto', type: 'hls' }],
      });
    }

    return res.status(400).json({ error: 'unknown action' });
  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({ error: error.message });
  }
}
