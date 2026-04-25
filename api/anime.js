// api/anime.js
export default async function handler(req, res) {
  // Разрешаем запросы со всех доменов
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { action, query, episodeId } = req.query;

  // Рабочий API amvstrm (проверен на 2024-07)
  const BASE = 'https://api.amvstr.me/api/v2';

  // Безопасный fetch с таймаутом 8 секунд
  async function safeFetch(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      });
      clearTimeout(timeout);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      clearTimeout(timeout);
      console.error(`Ошибка запроса к ${url}:`, error.message);
      return null;
    }
  }

  try {
    // ========== ПОИСК ==========
    if (action === 'search' && query) {
      const cleanQuery = encodeURIComponent(query.trim());
      const url = `${BASE}/search?q=${cleanQuery}&limit=12`;
      const data = await safeFetch(url);

      if (data && data.results && data.results.length > 0) {
        // Преобразуем результат в удобный вид
        const results = data.results.map(item => ({
          id: item.id,
          title: item.title.romaji || item.title.english || item.title.native || 'Без названия',
          releaseDate: item.year || item.releaseDate || '?',
          image: item.coverImage?.large || item.coverImage?.medium || ''
        }));
        return res.status(200).json({ results });
      }

      return res.status(200).json({ results: [] });
    }

    // ========== ИНФОРМАЦИЯ ОБ АНИМЕ (эпизоды) ==========
    if (action === 'info' && query) {
      const animeId = encodeURIComponent(query);
      const url = `${BASE}/anime/${animeId}`;
      const data = await safeFetch(url);

      if (data && data.episodes && data.episodes.length > 0) {
        return res.status(200).json({ episodes: data.episodes });
      }

      return res.status(200).json({ episodes: [] });
    }

    // ========== ССЫЛКА НА ВИДЕО ==========
    if (action === 'watch' && episodeId) {
      const epId = encodeURIComponent(episodeId);
      const url = `${BASE}/episode/${epId}`;
      const data = await safeFetch(url);

      if (data && data.sources && data.sources.length > 0) {
        // Ищем HLS поток или mp4
        const sources = data.sources.map(s => ({
          file: s.file,
          quality: s.quality,
          type: s.type
        }));
        return res.status(200).json({ sources });
      }

      return res.status(404).json({ error: 'Видео не найдено' });
    }

    return res.status(400).json({ error: 'Неверные параметры' });
  } catch (error) {
    return res.status(500).json({ error: 'Внутренняя ошибка сервера', message: error.message });
  }
}
