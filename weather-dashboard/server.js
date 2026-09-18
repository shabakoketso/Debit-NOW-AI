const express = require('express');
const path = require('path');
const axios = require('axios');

const app = express();
const port = process.env.WEATHER_PORT || 3100;
const openMeteo = axios.create({ timeout: 10000 });

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/weather/search', async (req, res) => {
  const query = String(req.query.q || '').trim();
  if (query.length < 2 || query.length > 80) {
    return res.status(400).json({ error: 'Search must contain between 2 and 80 characters.' });
  }

  try {
    const response = await openMeteo.get('https://geocoding-api.open-meteo.com/v1/search', {
      params: { name: query, count: 8, language: 'en', format: 'json' },
    });
    res.json({ results: response.data.results || [] });
  } catch (error) {
    res.status(502).json({ error: 'Unable to search for that location right now.' });
  }
});

app.get('/api/weather/forecast', async (req, res) => {
  const latitude = Number(req.query.latitude);
  const longitude = Number(req.query.longitude);
  const timezone = String(req.query.timezone || 'auto');
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return res.status(400).json({ error: 'Valid latitude and longitude are required.' });
  }

  try {
    const response = await openMeteo.get('https://api.open-meteo.com/v1/forecast', {
      params: {
        latitude,
        longitude,
        timezone,
        forecast_days: 7,
        current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m',
        hourly: 'temperature_2m,precipitation_probability,weather_code,relative_humidity_2m,wind_speed_10m',
        daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,sunrise,sunset',
        temperature_unit: 'celsius',
        wind_speed_unit: 'kmh',
      },
    });
    res.json(response.data);
  } catch (error) {
    res.status(502).json({ error: 'Unable to fetch weather data right now.' });
  }
});

app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

if (require.main === module) {
  app.listen(port, () => console.log(`Weather dashboard running at http://localhost:${port}`));
}

module.exports = app;
