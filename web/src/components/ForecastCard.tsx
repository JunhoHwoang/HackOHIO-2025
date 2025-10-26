import { useEffect, useState } from 'react';

type Props = { lotId: string; className?: string };

export default function ForecastCard({ lotId, className }: Props) {
  const [d, setD] = useState<any>(null);

  useEffect(() => {
    const weekday = new Date().getDay();                // 0..6
    const slot = new Date().toTimeString().slice(0, 5); // "HH:MM"
    const base = import.meta.env.VITE_API_BASE || 'http://localhost:4000';
    const url = `${base}/api/lots/${lotId}/forecast?weekday=${weekday}&slot=${slot}`;

    fetch(url)
      .then((r) => r.json())
      .then(setD)
      .catch((e) => console.error('forecast fetch failed', e));
  }, [lotId]);

  const wrapperClass =
    className ||
    'rounded-3xl border border-neutral-200 bg-white shadow-sm p-5 sm:p-6 text-sm text-osu-gray space-y-2';

  if (!d) return <div className={wrapperClass}>Loading forecast…</div>;

  return (
    <div className={wrapperClass}>
      <div className="text-sm font-semibold text-osu-scarlet">Forecast (this slot)</div>
      <div>
        Expected open: <span className="font-semibold text-emerald-600">{d.open_expected ?? '—'}</span>
      </div>
      <div className="text-xs text-gray-500">
        IQR: {d.open_p25 ?? '—'} – {d.open_p75 ?? '—'}
      </div>
    </div>
  );
}
