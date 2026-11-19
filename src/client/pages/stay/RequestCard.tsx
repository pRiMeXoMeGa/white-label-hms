import { useEffect, useRef, useState } from 'react';
import type { ServiceRequestDto } from '../../../shared/types';
import { Icon, type IconName } from '../../components/Icons';
import { announce } from '../../lib/announce';
import { ApiError, post, useApi } from '../../lib/api';
import { isUpcoming, localDateTime, money, timeOf } from '../../lib/format';
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
  // A cancelled card never goes back to an open state from an older copy of the list.
  useEffect(() => setR((prev) => (prev.id === initial.id && prev.isCancelled && !initial.isCancelled ? prev : initial)), [initial]);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  // Status changes are read out once through the app's single live region.
  const lastStatus = useRef(r.statusLabel);
  useEffect(() => {
    if (lastStatus.current !== r.statusLabel) announce(`${r.title}: ${r.statusLabel}`);
    lastStatus.current = r.statusLabel;
  }, [r.statusLabel, r.title]);
  // Spa treatments and transfers are bookings for a set time, so cancelling asks once more.
  const needsConfirm = r.service === 'spa' || r.service === 'transfer';
  const [error, setError] = useState<string | null>(null);
  const IconC = Icon[ICONS[r.service]];
  const currentIndex = r.steps.findIndex((s) => s.status === r.status);
  // A booking waiting for its booked time is not "being worked on", so its bar does not animate.
  const waiting = isUpcoming(r, hotel.timezone) && r.statusLabel !== r.steps[0]?.label;

  const cancel = async () => {
    if (needsConfirm && !confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
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
    <article className="request">
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
            <li key={s.status} title={s.label} data-done={i < currentIndex || (i === currentIndex && (r.isFinal || waiting))} data-current={i === currentIndex && !r.isFinal && !waiting} aria-current={i === currentIndex ? 'step' : undefined}>
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
        {r.canCancel && !confirming && (
          <button className="btn-link" disabled={busy} onClick={cancel}>
            {busy ? 'Cancelling…' : 'Cancel'}
          </button>
        )}
        {r.canCancel && confirming && (
          <span className="row" style={{ gap: '0.75rem' }}>
            <span>Cancel this booking?</span>
            <button className="btn-link" onClick={cancel}>
              Yes, cancel
            </button>
            <button className="btn-link" onClick={() => setConfirming(false)}>
              Keep it
            </button>
          </span>
        )}
      </div>
      {error && <p className="small" style={{ color: 'var(--danger)', margin: '0.4rem 0 0' }}>{error}</p>}
    </article>
  );
}

/** A card for a request that was just placed: follows the live list so its status keeps moving. */
export function LiveRequestCard({ r: placed }: { r: ServiceRequestDto }) {
  const { code } = useStay();
  const list = useApi<ServiceRequestDto[]>(`/stays/${code}/requests`, 4000);
  const live = list.data?.find((x) => x.id === placed.id) ?? placed;
  return <RequestCard r={live} onChange={list.reload} />;
}
