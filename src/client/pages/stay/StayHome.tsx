import type { ServiceRequestDto } from '../../../shared/types';
import { Icon, type IconName } from '../../components/Icons';
import { ErrorNotice, Spinner, gap } from '../../components/ui';
import { useApi } from '../../lib/api';
import { isUpcoming, money, shortDate } from '../../lib/format';
import { useHotel } from '../../lib/hotel';
import { Link } from '../../lib/router';
import { RequestCard } from './RequestCard';
import { useStay } from './StayApp';

export const SERVICES: Array<{ to: string; label: string; icon: IconName; blurb: string }> = [
  { to: '/dining', label: 'In-room dining', icon: 'dining', blurb: 'Breakfast, mains and drinks, 24 hours' },
  { to: '/housekeeping', label: 'Housekeeping', icon: 'housekeeping', blurb: 'Cleaning, towels, turndown' },
  { to: '/spa', label: 'Spa', icon: 'spa', blurb: 'Massages and treatments by time slot' },
  { to: '/laundry', label: 'Laundry', icon: 'laundry', blurb: 'Wash, press and dry cleaning' },
  { to: '/transfer', label: 'Airport transfer', icon: 'transfer', blurb: 'A car to or from DXB and DWC' },
  { to: '/amenities', label: 'Amenities', icon: 'amenity', blurb: 'Pillows, cots, adapters, free' },
  { to: '/maintenance', label: 'Report an issue', icon: 'maintenance', blurb: 'Air conditioning, water, lights' },
  { to: '/info', label: 'Hotel info', icon: 'info', blurb: 'Wi-Fi, opening hours, local guide' },
];

export function StayHome() {
  const hotel = useHotel();
  const { stay, code, base } = useStay();
  const requests = useApi<ServiceRequestDto[]>(`/stays/${code}/requests`, 4000);
  const open = requests.data?.filter((r) => !r.isFinal) ?? [];
  const upcoming = open.filter((r) => isUpcoming(r, hotel.timezone)).sort((a, b) => a.scheduledAt!.localeCompare(b.scheduledAt!));
  const active = open.filter((r) => !isUpcoming(r, hotel.timezone));
  const leavingToday = hotel.today >= stay.checkOut;

  return (
    <div className="stack" style={gap('1.25rem')}>
      <section className="keycard" aria-label="Your room">
        <div className="keycard-meta">Room</div>
        <div className="keycard-room">{stay.roomNumber}</div>
        <div className="keycard-meta">
          {stay.roomType}, floor {stay.floor}
        </div>
        <div className="keycard-foot">
          <div>
            Stay ID
            <strong>{stay.stayCode}</strong>
          </div>
          <div style={{ textAlign: 'right' }}>
            Check-out
            <strong>{shortDate(stay.checkOut)}</strong>
          </div>
        </div>
      </section>

      <p style={{ margin: 0 }}>
        Hello {stay.guestName.split(' ')[0]}. Anything you order here is added to your bill and paid at check-out.
      </p>

      <nav className="tiles" aria-label="Services">
        {SERVICES.slice(0, 5).map((s) => {
          const I = Icon[s.icon];
          return (
            <Link key={s.to} className="tile" href={`${base}${s.to}`}>
              <span className="tile-icon">
                <I />
              </span>
              {s.label}
            </Link>
          );
        })}
        <Link className="tile" href={`${base}/services`}>
          <span className="tile-icon">
            <Icon.grid />
          </span>
          All services
        </Link>
      </nav>

      <section className="stack" aria-labelledby="active-title" style={gap('0.6rem')}>
        <div className="spread">
          <h2 id="active-title" style={{ fontSize: 'var(--step-1)', margin: 0 }}>
            In progress
          </h2>
          {(requests.data?.length ?? 0) > 0 && (
            <Link className="small" href={`${base}/requests`}>
              All requests ({requests.data!.length})
            </Link>
          )}
        </div>
        {requests.loading && <Spinner />}
        {requests.error && !requests.data && (
          <div className="stack" style={gap('0.5rem')}>
            <ErrorNotice error={requests.error} />
            <button type="button" className="btn btn-ghost" onClick={requests.reload}>
              Try again
            </button>
          </div>
        )}
        {requests.data && active.length === 0 && (
          <p className="muted small" style={{ margin: 0 }}>
            {upcoming.length > 0
              ? 'Nothing in progress right now. Your upcoming bookings are listed below.'
              : 'Nothing in progress. Your orders and requests will show here with live status.'}
          </p>
        )}
        {active.map((r) => (
          <RequestCard key={r.id} r={r} onChange={requests.reload} />
        ))}
      </section>

      {upcoming.length > 0 && (
        <section className="stack" aria-labelledby="upcoming-title" style={gap('0.6rem')}>
          <h2 id="upcoming-title" style={{ fontSize: 'var(--step-1)', margin: 0 }}>
            Upcoming
          </h2>
          <p className="muted small" style={{ margin: 0 }}>
            Spa treatments and transfers are marked completed once their booked time has passed.
          </p>
          {upcoming.map((r) => (
            <RequestCard key={r.id} r={r} onChange={requests.reload} />
          ))}
        </section>
      )}

      <section className="panel stack" style={gap('0.75rem')}>
        <div className="bill-total">
          <span>Current bill</span>
          <span className="price" style={{ fontSize: 'var(--step-2)' }}>
            {money(stay.balanceMinor)}
          </span>
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          Includes taxes and fees. Check-out by {hotel.checkOutTime} on {shortDate(stay.checkOut)}.
        </p>
        <div className="row">
          <Link className={`btn ${leavingToday ? 'btn-accent' : 'btn-ghost'}`} href={`${base}/checkout`}>
            Check out
          </Link>
          <Link className="btn-link" href={`${base}/bill`}>
            See itemised bill
          </Link>
        </div>
      </section>
    </div>
  );
}
