export const MS_PER_MINUTE = 60_000;
export const MS_PER_HOUR = 3_600_000;
export const MS_PER_DAY = 86_400_000;

const ET_ZONE = "America/New_York";

const etFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: ET_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  weekday: "short",
});

type EtParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: string;
};

export function toEtParts(date: Date): EtParts {
  const parts = etFormatter.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    weekday: get("weekday"),
  };
}

export function isRegularHoursET(date: Date): boolean {
  const { hour, minute, weekday } = toEtParts(date);
  if (weekday === "Sat" || weekday === "Sun") return false;
  const minutesSinceMidnight = hour * 60 + minute;
  const open = 9 * 60 + 30;
  const close = 16 * 60;
  return minutesSinceMidnight >= open && minutesSinceMidnight <= close;
}

export function isWithinLast30Days(date: Date, now: Date = new Date()): boolean {
  const diff = now.getTime() - date.getTime();
  return diff >= 0 && diff <= 30 * MS_PER_DAY;
}

export function roundToMinute(date: Date): Date {
  const ms = date.getTime();
  return new Date(ms - (ms % MS_PER_MINUTE));
}

export function formatEtIso(date: Date): string {
  const { year, month, day, hour, minute } = toEtParts(date);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)} ET`;
}
