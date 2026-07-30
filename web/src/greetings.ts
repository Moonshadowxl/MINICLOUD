/**
 * Time-of-day greetings. Local, instant, works offline — deliberately not an LLM call.
 * The late-night "Moonlight" band is the signature moment.
 */

export type Band = 'morning' | 'afternoon' | 'evening' | 'night';

export function bandFor(hour: number): Band {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}

const LINES: Record<Band, string[]> = {
  morning: [
    'Good morning, {name}',
    'Morning, {name} — fresh start',
    'Rise and shine, {name}',
    'Coffee first, {name}?',
  ],
  afternoon: [
    'Good afternoon, {name}',
    'Afternoon, {name} — keep it rolling',
    'Hey {name}, midday check-in',
  ],
  evening: [
    'Good evening, {name}',
    'Evening, {name} — wind down or lock in?',
    'Welcome back, {name}',
  ],
  night: [
    'Moonlight, {name} 🌙',
    'Late night, {name}? Everything held',
    'Still up, {name}? The vault never warms',
    'Night shift, {name} 🌙',
  ],
};

const SUBS: Record<Band, string> = {
  morning: 'Everything stayed sealed while you slept.',
  afternoon: 'The chamber is cold and nothing has moved.',
  evening: 'All quiet on the shelves.',
  night: 'Quiet hours. Your work is under frost.',
};

export function greetingFor(name: string, date = new Date()): { title: string; sub: string; band: Band } {
  const band = bandFor(date.getHours());
  const lines = LINES[band];
  // stable within an hour, varies day to day
  const idx = (date.getDate() + date.getHours()) % lines.length;
  return { title: lines[idx].replace('{name}', name), sub: SUBS[band], band };
}

export const isNight = (date = new Date()): boolean => bandFor(date.getHours()) === 'night';
