import { useEffect, useState } from 'react';
import type { ServiceRequestDto } from '../../../shared/types';
import { Icon, type IconName } from '../../components/Icons';
import { ApiError, post } from '../../lib/api';
import { localDateTime, money, timeOf } from '../../lib/format';
import { useHotel } from '../../lib/hotel';
import { useStay } from './StayApp';

const ICONS: Record<ServiceRequestDto['service'], IconName> = {
  food: 'dining',
  laundry: 'laundry',
  housekeeping: 'housekeeping',
  amenity: 'amenity',
  maintenance: 'maintenance',
  spa: 'spa',
  transfer: 'transfer',
};

export function RequestCard({ r: initial, onChange }: { r: ServiceRequestDto; onChange: () => void }) {
  const hotel = useHotel();
  const { code } = useStay();
  // Local copy so the card updates straight after a cancel, even where the parent does not refetch.
  const [r, setR] = useState(initial);
  useEffect(() => setR(initial), [initial]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const IconC = Icon[ICONS[r.service]];
  const currentIndex = r.steps.findIndex((s) => s.status === r.status);

  const cancel = async () => {
    setBusy(true);
    setError(null);
    try {
      setR(await post<ServiceRequestDto>(`/stays/${code}/requests/${r.id}/cancel`));
      onChange();
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="request" aria-live="polite">
      <div className="request-head">
        <div className="row" style={{ gap: '0.6rem', flexWrap: 'nowrap' }}>
          <span className="tile-icon" style={{ flex: 'none' }}>
            <IconC />
          </span>
          <h3>{r.title}</h3>
        </div>
        {r.totalMinor > 0 && <span className="num small">{money(r.totalMinor)}</span>}
      </div>
      <p className="status-line" data-final={r.isFinal && !r.isCancelled} data-cancelled={r.isCancelled}>
        {r.statusLabel}
        {r.scheduledAt && !r.isCancelled ? `, ${localDateTime(r.scheduledAt)}` : ''}
      </p>
      {!r.isCancelled && (
        <ol className="steps" aria-label="Progress">
          {r.steps.map((s, i) => (
            <li key={s.status} title={s.label} data-done={i < currentIndex || (i === currentIndex && r.isFinal)} data-current={i === currentIndex && !r.isFinal}>
              <span className="visually-hidden">
                {s.label}
                {s.at ? ` at ${timeOf(s.at, hotel.timezone)}` : ''}
              </span>
            </li>
          ))}
        </ol>
      )}
      <div className="request-foot">
        <span>Requested {timeOf(r.createdAt, hotel.timezone)}</span>
        {r.canCancel && (
          <button className="btn-link" disabled={busy} onClick={cancel}>
            {busy ? 'Cancelling…' : 'Cancel'}
          </button>
        )}
      </div>
      {error && <p className="small" style={{ color: 'var(--danger)', margin: '0.4rem 0 0' }}>{error}</p>}
    </article>
  );
}
