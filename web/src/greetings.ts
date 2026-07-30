/**
 * Time-of-day greetings. Local, instant, works offline — deliberately not an LLM call.
 *
 * Written in the station's own voice: calm, specific, about *this machine*. The
 * generic-assistant register ("Rise and shine", "keep it rolling", "the cloud never
 * sleeps") is what every product ships, and here it lands in the largest type on the
 * most personal screen — the one place the whole design would read as generated.
 * The late-night "Moonlight" line is a pinned brand moment and stays.
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
    'Morning, {name}',
    'First light, {name}',
    'Clear morning, {name}',
  ],
  afternoon: [
    'Good afternoon, {name}',
    'Afternoon, {name}',
    'Midday, {name}',
  ],
  evening: [
    'Good evening, {name}',
    'Evening, {name}',
    'Welcome back, {name}',
  ],
  night: [
    'Moonlight, {name}',
    'Night watch, {name}',
    'Still up, {name}?',
    'Late hours, {name}',
  ],
};

/**
 * Subtitles state something true about the machine rather than promising
 * activity ("everything synced while you slept") that may not have happened.
 */
const SUBS: Record<Band, string> = {
  morning: 'The station held overnight.',
  afternoon: 'Everything is where you left it.',
  evening: 'All quiet on the station.',
  night: 'Running quietly, nothing to do.',
};

export function greetingFor(name: string, date = new Date()): { title: string; sub: string; band: Band } {
  const band = bandFor(date.getHours());
  const lines = LINES[band];
  // stable within an hour, varies day to day
  const idx = (date.getDate() + date.getHours()) % lines.length;
  return { title: lines[idx].replace('{name}', name), sub: SUBS[band], band };
}

export const isNight = (date = new Date()): boolean => bandFor(date.getHours()) === 'night';
