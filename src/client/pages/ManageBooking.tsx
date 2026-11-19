import { useState, type FormEvent } from 'react';
import type { ReservationDto } from '../../shared/types';
import { ErrorNotice, Field, Notice } from '../components/ui';
import { ApiError, api, post } from '../lib/api';
import { longDate, money, plural, shortDate } from '../lib/format';
import { rememberStay, useHotel } from '../lib/hotel';
import { Link, useLocation, useTitle } from '../lib/router';

const STATUS: Record<ReservationDto['status'], string> = {
  confirmed: 'Confirmed',
  checked_in: 'Checked in',
  checked_out: 'Checked out',
  cancelled: 'Cancelled',
};

export function ManageBooking() {
  const hotel = useHotel();
  useTitle('Manage booking', hotel.brand.name);
  const { search } = useLocation();
  const [code, setCode] = useState(search.get('code') ?? '');
  const [lastName, setLastName] = useState('');
  const [booking, setBooking] = useState<ReservationDto | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const find = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<ReservationDto>(`/reservations/${encodeURIComponent(code.trim())}?lastName=${encodeURIComponent(lastName)}`);
      setBooking(r);
      if (r.stayCode) rememberStay(r.stayCode);
    } catch (err) {
      setError(err as ApiError);
      setBooking(null);
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!booking) return;
    setBusy(true);
    setError(null);
    try {
      setBooking(await post<ReservationDto>(`/reservations/${booking.code}/cancel`, { lastName }));
      setConfirmCancel(false);
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container page" style={{ maxWidth: 720 }}>
      <h1 className="page-title" style={{ fontSize: 'var(--step-3)' }}>
        Manage booking
      </h1>
      {!booking ? (
        <form className="panel stack" onSubmit={find}>
          <p className="muted">Enter the reference from your confirmation and the last name on the booking.</p>
          <div className="grid-2">
            <Field label="Booking reference">
              <input required placeholder="SB-7K3QXA" autoCapitalize="characters" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
            </Field>
            <Field label="Last name">
              <input required autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </Field>
          </div>
          <ErrorNotice error={error} />
          <button className="btn" disabled={busy}>
            {busy ? 'Finding…' : 'Find booking'}
          </button>
        </form>
      ) : (
        <section className="panel stack summary">
          <div className="spread">
            <h3 style={{ margin: 0 }}>
              {booking.roomType.name}, {booking.code}
            </h3>
            <span className="tag">{STATUS[booking.status]}</span>
          </div>
          <dl>
            <dt>Guest</dt>
            <dd>
              {booking.guest.firstName} {booking.guest.lastName}
            </dd>
            <dt>Dates</dt>
            <dd>
              {shortDate(booking.checkIn)} to {shortDate(booking.checkOut)}, {plural(booking.nights, 'night')}
            </dd>
            {booking.roomNumber && (
              <>
                <dt>Room</dt>
                <dd>{booking.roomNumber}</dd>
              </>
            )}
            <dt>Room total</dt>
            <dd>{money(booking.roomTotalMinor)}</dd>
          </dl>
          <ErrorNotice error={error} />
          {booking.status === 'confirmed' && (
            <>
              {hotel.today >= booking.canCheckInFrom ? (
                <Link className="btn btn-accent" href={`/check-in?code=${booking.code}`}>
                  Check in online
                </Link>
              ) : (
                <Notice>Online check-in opens on {longDate(booking.canCheckInFrom)}.</Notice>
              )}
              {!confirmCancel ? (
                <button className="btn btn-danger" onClick={() => setConfirmCancel(true)}>
                  Cancel booking
                </button>
              ) : (
                <div className="notice stack">
                  <p style={{ margin: 0 }}>Cancel this booking? The room will be released and this cannot be undone.</p>
                  <div className="row">
                    <button className="btn btn-danger" disabled={busy} onClick={cancel}>
                      Yes, cancel booking
                    </button>
                    <button className="btn btn-ghost" onClick={() => setConfirmCancel(false)}>
                      Keep booking
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
          {booking.status === 'checked_in' && booking.stayCode && (
            <Link className="btn btn-accent" href={`/stay/${booking.stayCode}`}>
              Open my stay
            </Link>
          )}
          {booking.status === 'checked_out' && booking.stayCode && (
            <Link className="btn btn-ghost" href={`/stay/${booking.stayCode}/thanks`}>
              View invoice
            </Link>
          )}
          {booking.status === 'cancelled' && <Notice>This booking is cancelled. Nothing will be charged.</Notice>}
          <button className="btn-link" onClick={() => setBooking(null)}>
            Look up another booking
          </button>
        </section>
      )}
    </div>
  );
}
