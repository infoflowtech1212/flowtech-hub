/** Small immutable date helpers for the calendar views. Weeks start Monday. */

export const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

export const endOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};

export const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

export const addMonths = (d: Date, n: number) => {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
};

export const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
export const endOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);

/** Monday-based start of week. */
export const startOfWeek = (d: Date) => {
  const x = startOfDay(d);
  const dow = (x.getDay() + 6) % 7; // 0 = Monday
  return addDays(x, -dow);
};

/** The 6x7 grid of days covering the month that contains `d`. */
export const monthGrid = (d: Date): Date[] => {
  const first = startOfWeek(startOfMonth(d));
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
};

/** The 7 days of the week containing `d`. */
export const weekDays = (d: Date): Date[] => {
  const first = startOfWeek(d);
  return Array.from({ length: 7 }, (_, i) => addDays(first, i));
};

export const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export const isSameMonth = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();

export const isToday = (d: Date) => isSameDay(d, new Date());

export const monthTitle = (d: Date) =>
  d.toLocaleDateString([], { month: 'long', year: 'numeric' });

export const weekTitle = (d: Date) => {
  const days = weekDays(d);
  const start = days[0].toLocaleDateString([], { month: 'short', day: 'numeric' });
  const end = days[6].toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  return `${start} – ${end}`;
};

export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
