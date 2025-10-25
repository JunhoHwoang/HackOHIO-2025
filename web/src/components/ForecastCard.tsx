import { useEffect, useState } from 'react';

type Props = { lotId: string };

export default function ForecastCard({ lotId }: Props) {
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

  if (!d) return <div className="rounded border p-3">Loading forecast…</div>;

  return (
    <div className="rounded border p-3">
      <div className="font-medium mb-1">Forecast (this slot)</div>
      <div className="text-sm">
        Expected open: <span className="font-semibold">{d.open_expected ?? '—'}</span>
      </div>
      <div className="text-xs text-gray-500">
        IQR: {d.open_p25 ?? '—'} – {d.open_p75 ?? '—'}
      </div>
    </div>
  );
}
