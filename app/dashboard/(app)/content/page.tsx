import ContentManager from '@/components/dashboard/ContentManager';
import { requireUser } from '@/lib/auth';
import { listContentBoard } from '@/modules/content-board/service';

export const dynamic = 'force-dynamic';

type View = 'week' | 'day';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const fromIso = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
};

const toIso = (date: Date) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(
    date.getUTCDate(),
  ).padStart(2, '0')}`;

const addDays = (value: string, amount: number) => {
  const date = fromIso(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return toIso(date);
};

const startOfWeek = (value: string) => {
  const date = fromIso(value);
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - (day === 0 ? 6 : day - 1));
  return toIso(date);
};

const todayInLisbon = () => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Lisbon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';

  return `${part('year')}-${part('month')}-${part('day')}`;
};

export default async function ContentPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string }>;
}) {
  await requireUser();
  const params = await searchParams;

  const view: View = params.view === 'day' ? 'day' : 'week';
  const selectedDate = params.date && DATE.test(params.date) ? params.date : todayInLisbon();

  const from = view === 'week' ? startOfWeek(selectedDate) : selectedDate;
  const to = view === 'week' ? addDays(from, 6) : selectedDate;

  const items = await listContentBoard({ from, to });

  return <ContentManager items={items} view={view} selectedDate={selectedDate} />;
}
