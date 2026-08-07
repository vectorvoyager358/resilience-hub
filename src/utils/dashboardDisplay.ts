export type ReflectionWeatherApiPayload = {
  temperatureC: number;
  weatherCode: number;
  isDay?: boolean | number;
  observationTimeLocal?: string | null;
  emojis?: string;
};

export function celsiusToFahrenheitOneDecimal(celsius: number): number {
  return Math.round((celsius * (9 / 5) + 32) * 10) / 10;
}

export function inferIsDayFromLocalClock(timeLocal: string | null | undefined): boolean | null {
  if (typeof timeLocal !== 'string') return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(timeLocal.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return null;
  return hour >= 6 && hour < 19;
}

export function coerceWeatherIsDay(
  raw: unknown,
  observationTimeLocal: string | null | undefined,
): boolean {
  if (raw === false || raw === 0 || raw === '0') return false;
  if (raw === true || raw === 1 || raw === '1') return true;
  return inferIsDayFromLocalClock(observationTimeLocal) ?? true;
}

export function reflectionWeatherEmojis(isDay: boolean, weatherCode: number): string {
  const period = isDay ? '🌞' : '🌙';
  if (weatherCode === 45 || weatherCode === 48) return `${period}🌫️`;
  if ([51, 53, 55, 56, 57].includes(weatherCode)) return `${period}🌦️`;
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(weatherCode)) return `${period}🌧️`;
  if ([71, 73, 75, 77, 85, 86].includes(weatherCode)) return `${period}❄️`;
  if ([95, 96, 99].includes(weatherCode)) return `${period}⛈️`;
  if (weatherCode === 0) return isDay ? '🌞' : '🌙✨';
  if (weatherCode === 1) return `${period}🌤️`;
  if (weatherCode === 2) return `${period}⛅`;
  if (weatherCode === 3) return `${period}☁️`;
  return `${period}🌡️`;
}

export function reflectionWeatherDisplayEmojis(weather: ReflectionWeatherApiPayload): string {
  const fromApi = typeof weather.emojis === 'string' ? weather.emojis.trim() : '';
  if (fromApi) return fromApi;
  return reflectionWeatherEmojis(
    coerceWeatherIsDay(weather.isDay, weather.observationTimeLocal ?? null),
    weather.weatherCode,
  );
}

export function getLocalDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function toTitleCase(value: string): string {
  return value.split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}
