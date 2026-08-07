import { describe, expect, it } from 'vitest';
import {
  celsiusToFahrenheitOneDecimal,
  getLocalDateKey,
  reflectionWeatherDisplayEmojis,
  toTitleCase,
} from '../../../src/utils/dashboardDisplay';

describe('dashboard display helpers', () => {
  it('formats temperature and local dates', () => {
    expect(celsiusToFahrenheitOneDecimal(20)).toBe(68);
    expect(celsiusToFahrenheitOneDecimal(21.25)).toBe(70.3);
    expect(getLocalDateKey(new Date(2026, 7, 7, 23, 30))).toBe('2026-08-07');
  });

  it('prefers server weather emojis and otherwise infers day/night', () => {
    expect(reflectionWeatherDisplayEmojis({ temperatureC: 20, weatherCode: 61, emojis: ' custom ' }))
      .toBe('custom');
    expect(reflectionWeatherDisplayEmojis({
      temperatureC: 20,
      weatherCode: 0,
      observationTimeLocal: '22:10',
    })).toBe('🌙✨');
  });

  it('title-cases display names', () => {
    expect(toTitleCase('jANE DOE')).toBe('Jane Doe');
  });
});
