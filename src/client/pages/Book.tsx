import { useState, type FormEvent } from 'react';
import type { AvailabilityResult, ReservationDto } from '../../shared/types';
import { ErrorNotice, Field, Notice, Spinner, gap } from '../components/ui';
import { ApiError, post, useApi } from '../lib/api';
import { formatCardNumber, formatExpiry, money, plural, shortDate } from '../lib/format';
import { useHotel } from '../lib/hotel';
import { Link, navigate, useLocation, useTitle } from '../lib/router';
import { searchQuery } from '../components/SearchForm';
import { readSearch } from './Rooms';

export function saveBooking(r: ReservationDto) {
  try {
    sessionStorage.setItem(`booking:${r.code}`, JSON.stringify(r));
  } catch {
    /* ignore */
  }
}

export function Book({ slug }: { slug: string }) {
  const hotel = useHotel();
  useTitle('Your details', hotel.brand.name);
  const { search } = useLocation();
  const s = readSearch(search, hotel.today);
  const q = searchQuery(s);
  const avail = useApi<AvailabilityResult>(`/availability?${q}`);
  const option = avail.data?.options.find((o) => o.roomType.slug === slug);

  const [guest, setGuest] = useState({ firstName: '', lastName: '', email: '', phone: '', specialRequests: '' });
  const [card, setCard] = useState({ holder: '', number: '', expiry: '', cvc: '' });
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await post<ReservationDto>('/reservations', {
        roomTypeSlug: slug,
        checkIn: s.checkIn,
        checkOut: s.checkOut,
        adults: s.adults,
        children: s.children,
        guest: { ...guest, specialRequests: guest.specialRequests || undefined },
        // The CVC is checked for format here and never leaves the browser.
        card: { holder: card.holder, number: card.number, expiry: card.expiry },
      });
      saveBooking(r);
      navigate(`/booking/${r.code}`);
    } catch (err) {
      setError(err as ApiError);
      setBusy(false);
    }
  };

  if (avail.loading) return <Spinner />;
  if (avail.error) return <div className="container page"><ErrorNotice error={avail.error} /></div>;
  if (!option) return <div className="container page"><Notice tone="error">That room type does not exist.</Notice></div>;

  const nights = avail.data!.nights;

  return (
    <div className="container page">
      <Link href={`/rooms?${q}`} className="back">
        Back to rooms
      </Link>
      <h1 className="page-title" style={{ fontSize: 'var(--step-3)' }}>
        Your details
      </h1>
      <div className="split">
        <form className="stack" style={gap('1.5rem')} onSubmit={submit}>
          <fieldset className="panel stack">
            <legend>Who is staying</legend>
            <div className="grid-2">
              <Field label="First name">
                <input required autoComplete="given-name" value={guest.firstName} onChange={(e) => setGuest({ ...guest, firstName: e.target.value })} />
              </Field>
              <Field label="Last name" hint="(you will use it to find your booking)">
                <input required autoComplete="family-name" value={guest.lastName} onChange={(e) => setGuest({ ...guest, lastName: e.target.value })} />
              </Field>
              <Field label="Email">
                <input required type="email" autoComplete="email" value={guest.email} onChange={(e) => setGuest({ ...guest, email: e.target.value })} />
              </Field>
              <Field label="Mobile number">
                <input required type="tel" autoComplete="tel" placeholder="+971 50 123 4567" value={guest.phone} onChange={(e) => setGuest({ ...guest, phone: e.target.value })} />
              </Field>
            </div>
            <Field label="Special requests" hint="(optional)">
              <textarea value={guest.specialRequests} maxLength={500} placeholder="High floor, early arrival, celebrating something…" onChange={(e) => setGuest({ ...guest, specialRequests: e.target.value })} />
            </Field>
          </fieldset>

          <fieldset className="panel stack">
            <legend>Guarantee with a card</legend>
            <p className="small muted">
              Nothing is charged now. You pay for the stay and anything you order at check-out. This is a demo: use test card
              4242 4242 4242 4242 with any future expiry.
            </p>
            <Field label="Name on card">
              <input required autoComplete="cc-name" value={card.holder} onChange={(e) => setCard({ ...card, holder: e.target.value })} />
            </Field>
            <Field label="Card number">
              <input required inputMode="numeric" autoComplete="cc-number" placeholder="4242 4242 4242 4242" value={card.number} onChange={(e) => setCard({ ...card, number: formatCardNumber(e.target.value) })} />
            </Field>
            <div className="grid-2">
              <Field label="Expiry">
                <input required inputMode="numeric" autoComplete="cc-exp" placeholder="MM/YY" value={card.expiry} onChange={(e) => setCard({ ...card, expiry: formatExpiry(e.target.value) })} />
              </Field>
              <Field label="Security code">
                <input required inputMode="numeric" autoComplete="cc-csc" pattern="\d{3,4}" maxLength={4} placeholder="123" value={card.cvc} onChange={(e) => setCard({ ...card, cvc: e.target.value.replace(/\D/g, '') })} />
              </Field>
            </div>
          </fieldset>

          <label className="check">
            <input type="checkbox" required checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>I accept the hotel's booking terms. Free cancellation online until check-in.</span>
          </label>
          <ErrorNotice error={error} />
          <button className="btn btn-accent btn-block" disabled={busy} type="submit">
            {busy ? 'Confirming…' : `Confirm booking, ${money(option.totalMinor)}`}
          </button>
        </form>

        <aside className="panel summary">
          <h3>{option.roomType.name}</h3>
          <p className="small muted">
            {shortDate(s.checkIn)} to {shortDate(s.checkOut)}, {plural(s.adults, 'adult')}
            {s.children ? `, ${plural(s.children, 'child', 'children')}` : ''}
          </p>
          <dl>
            {option.nightly.map((n) => (
              <div key={n.date} style={{ display: 'contents' }}>
                <dt>Night of {shortDate(n.date)}</dt>
                <dd>{money(n.rateMinor)}</dd>
              </div>
            ))}
            <dt className="total">Room total, {plural(nights, 'night')}</dt>
            <dd className="total">{money(option.totalMinor)}</dd>
          </dl>
          <p className="small muted" style={{ marginTop: '0.8rem' }}>
            {hotel.taxesNote}
          </p>
        </aside>
      </div>
    </div>
  );
}
