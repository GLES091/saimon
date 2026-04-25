// api/anime.js

export default async function handler(req, res) {
  // Разрешаем запросы только от нашего сайта (по желанию)
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { action, query, episodeId } = req.query;

  // Базовый URL Consumet (публичный, без ключа)
  const CONSUMET_API = 'https://api.consumet.org/anime/gogoanime';

  try {
    // 1. Поиск аниме
    if (action === 'search' && query) {
      const response = await fetch(`${CONSUMET_API}/${encodeURIComponent(query)}`);
      const data = await response.json();
      return res.status(200).json(data);
    }

    // 2. Получить список эпизодов по ID аниме
    if (action === 'episodes' && query) {
      const response = await fetch(`${CONSUMET_API}/info/${encodeURIComponent(query)}`);
      const data = await response.json();
      return res.status(200).json(data);
    }

    // 3. Получить источник для просмотра (ссылка на HLS/mp4)
    if (action === 'watch' && episodeId) {
      const response = await fetch(`${CONSUMET_API}/watch/${encodeURIComponent(episodeId)}`);
      const data = await response.json();
      return res.status(200).json(data);
    }

    // Если параметры не переданы
    return res.status(400).json({ error: 'Нужны параметры action и query/episodeId' });

  } catch (error) {
    return res.status(500).json({ error: 'Ошибка сервера', message: error.message });
  }
}
