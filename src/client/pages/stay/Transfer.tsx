import { useState, type FormEvent } from 'react';
import type { ServiceRequestDto, TransferOptions } from '../../../shared/types';
import { ErrorNotice, Field, Spinner, gap } from '../../components/ui';
import { ApiError, post, useApi } from '../../lib/api';
import { money, shortDate } from '../../lib/format';
import { useHotel } from '../../lib/hotel';
import { StayHomeButton } from './CatalogOrder';
import { RequestCard } from './RequestCard';
import { stayDates } from './Spa';
import { BackLink, useStay } from './StayApp';

type Options = { transfers: TransferOptions & { minLeadMinutes: number } };

const TIMES = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);

export function Transfer() {
  const hotel = useHotel();
  const { code, stay, reload } = useStay();
  const options = useApi<Options>(`/stays/${code}/options`);
  const dates = stayDates(hotel.today, stay.checkOut);
  const [form, setForm] = useState({
    direction: 'to_airport' as 'to_airport' | 'from_airport',
    airport: 'DXB',
    vehicle: 'sedan',
    date: dates.at(-1) ?? hotel.today,
    time: '10:00',
    flightNumber: '',
    passengers: 1,
    notes: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [booked, setBooked] = useState<ServiceRequestDto | null>(null);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const vehicle = options.data?.transfers.vehicles.find((v) => v.code === form.vehicle);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setBooked(
        await post<ServiceRequestDto>(`/stays/${code}/transfers`, {
          direction: form.direction,
          airport: form.airport,
          vehicle: form.vehicle,
          pickupAt: `${form.date}T${form.time}`,
          flightNumber: form.flightNumber,
          passengers: form.passengers,
          notes: form.notes || undefined,
        }),
      );
      reload();
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setBusy(false);
    }
  };

  if (booked) {
    return (
      <div className="stack">
        <BackLink>Home</BackLink>
        <h1 style={{ fontSize: 'var(--step-2)' }}>Transfer booked</h1>
        <RequestCard r={booked} onChange={() => undefined} />
        <p className="small muted">Your driver will wait in the lobby with a name sign. We track your flight for arrivals.</p>
        <StayHomeButton />
      </div>
    );
  }

  return (
    <form className="stack" style={gap('1.1rem')} onSubmit={submit}>
      <BackLink>Home</BackLink>
      <div>
        <h1 style={{ fontSize: 'var(--step-2)' }}>Airport transfer</h1>
        <p className="muted" style={{ margin: 0 }}>
          Fixed price per car, book at least {options.data ? options.data.transfers.minLeadMinutes / 60 : 2} hours ahead.
        </p>
      </div>
      {options.loading && <Spinner />}
      {options.data && (
        <>
          <div className="menu-cats" role="group" aria-label="Direction">
            <button type="button" className="chip" aria-pressed={form.direction === 'to_airport'} onClick={() => set({ direction: 'to_airport' })}>
              Hotel to airport
            </button>
            <button type="button" className="chip" aria-pressed={form.direction === 'from_airport'} onClick={() => set({ direction: 'from_airport' })}>
              Airport to hotel
            </button>
          </div>
          <Field label="Airport">
            <select value={form.airport} onChange={(e) => set({ airport: e.target.value })}>
              {options.data.transfers.airports.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.name} ({a.code}), about {a.durationMin} min
                </option>
              ))}
            </select>
          </Field>
          <div className="grid-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Field label={form.direction === 'to_airport' ? 'Pickup day' : 'Landing day'}>
              <select value={form.date} onChange={(e) => set({ date: e.target.value })}>
                {dates.map((d) => (
                  <option key={d} value={d}>
                    {d === hotel.today ? 'Today' : shortDate(d)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={form.direction === 'to_airport' ? 'Pickup time' : 'Landing time'}>
              <select value={form.time} onChange={(e) => set({ time: e.target.value })}>
                {TIMES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field label="Flight number">
              <input required placeholder="EK 203" autoCapitalize="characters" value={form.flightNumber} onChange={(e) => set({ flightNumber: e.target.value.toUpperCase() })} />
            </Field>
            <Field label="Passengers">
              <select value={form.passengers} onChange={(e) => set({ passengers: Number(e.target.value) })}>
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </Field>
          </div>
          <fieldset>
            <legend style={{ fontSize: '1rem' }}>Car</legend>
            <div className="choice-list">
              {options.data.transfers.vehicles.map((v) => (
                <label key={v.code} className="choice">
                  <input type="radio" name="vehicle" checked={form.vehicle === v.code} onChange={() => set({ vehicle: v.code })} />
                  <span className="choice-body">
                    <span className="choice-title">
                      <span>{v.name}</span>
                      <span className="num">{money(v.priceMinor, { whole: true })}</span>
                    </span>
                    <span className="small muted">
                      Up to {v.seats} passengers and {v.bags} large bags
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="Notes for the driver" hint="(optional)">
            <textarea maxLength={300} value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
          </Field>
          {vehicle && form.passengers > vehicle.seats && (
            <p className="small" style={{ color: 'var(--danger)', margin: 0 }}>
              {vehicle.name} seats up to {vehicle.seats}. Choose a bigger car.
            </p>
          )}
          <ErrorNotice error={error} />
          <button className="btn btn-accent btn-block" disabled={busy}>
            {busy ? 'Booking…' : `Book transfer${vehicle ? `, ${money(vehicle.priceMinor, { whole: true })}` : ''}`}
          </button>
        </>
      )}
    </form>
  );
}
