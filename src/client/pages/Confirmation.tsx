import type { ReservationDto } from '../../shared/types';
import { Notice, gap } from '../components/ui';
import { longDate, money, plural, shortDate } from '../lib/format';
import { useHotel } from '../lib/hotel';
import { Link, useTitle } from '../lib/router';

function loadBooking(code: string): ReservationDto | null {
  try {
    const raw = sessionStorage.getItem(`booking:${code}`);
    return raw ? (JSON.parse(raw) as ReservationDto) : null;
  } catch {
    return null;
  }
}

export function Confirmation({ code }: { code: string }) {
  const hotel = useHotel();
  useTitle('Booking confirmed', hotel.brand.name);
  const r = loadBooking(code);

  if (!r) {
    return (
      <div className="container page stack">
        <Notice>
          Open your booking with its reference and your last name on <Link href={`/manage?code=${code}`}>Manage booking</Link>.
        </Notice>
      </div>
    );
  }

  const canCheckInNow = hotel.today >= r.canCheckInFrom && hotel.today < r.checkOut;
  const startsToday = r.checkIn === hotel.today;

  return (
    <div className="container page">
      <div className="split">
        <section className="panel stack" style={gap('1.1rem')}>
          <p className="muted" style={{ margin: 0 }}>
            Booking confirmed for {r.guest.firstName} {r.guest.lastName}.
          </p>
          <div>
            <div className="small muted">Your booking reference</div>
            <div className="reference">{r.code}</div>
          </div>
          <p>
            Keep this reference. With your last name, it lets you check in online, manage the booking and open your in-stay
            app.
          </p>
          {canCheckInNow ? (
            <Notice tone="ok">
              {startsToday ? 'Your stay starts today, so online check-in is already open.' : 'Online check-in is already open for this booking.'}
            </Notice>
          ) : (
            <Notice>Online check-in opens on {longDate(r.canCheckInFrom)}.</Notice>
          )}
          <div className="row">
            {canCheckInNow ? (
              <Link className="btn btn-accent" href={`/check-in?code=${r.code}`}>
                Check in online
              </Link>
            ) : (
              <button type="button" className="btn btn-accent" disabled>
                Check in online
              </button>
            )}
            <Link className="btn btn-ghost" href={`/manage?code=${r.code}`}>
              Manage booking
            </Link>
          </div>
        </section>
        <aside className="panel summary">
          <h3>{r.roomType.name}</h3>
          <dl>
            <dt>Guest</dt>
            <dd>
              {r.guest.firstName} {r.guest.lastName}
            </dd>
            <dt>Check-in</dt>
            <dd>
              {shortDate(r.checkIn)}, from {hotel.checkInTime}
            </dd>
            <dt>Check-out</dt>
            <dd>
              {shortDate(r.checkOut)}, by {hotel.checkOutTime}
            </dd>
            <dt>Guests</dt>
            <dd>
              {plural(r.adults, 'adult')}
              {r.children ? `, ${plural(r.children, 'child', 'children')}` : ''}
            </dd>
            <dt>Card guarantee</dt>
            <dd>ending {r.cardLast4}</dd>
            <dt className="total">Room total, {plural(r.nights, 'night')}</dt>
            <dd className="total">{money(r.roomTotalMinor)}</dd>
          </dl>
          <p className="small muted" style={{ marginTop: '0.8rem' }}>
            {hotel.taxesNote}
          </p>
        </aside>
      </div>
    </div>
  );
}
