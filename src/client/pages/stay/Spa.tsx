import { useState } from 'react';
import type { ServiceRequestDto, SpaSlotDto, SpaTreatmentDto } from '../../../shared/types';
import { ErrorNotice, Field, Notice, Spinner, gap } from '../../components/ui';
import { ApiError, post, useApi } from '../../lib/api';
import { addDays, localDateTime, money, shortDate } from '../../lib/format';
import { useHotel } from '../../lib/hotel';
import { StayHomeButton } from './CatalogOrder';
import { LiveRequestCard } from './RequestCard';
import { BackLink, useStay } from './StayApp';

interface Options {
  spa: { opensAt: string; closesAt: string; minLeadMinutes: number; treatments: SpaTreatmentDto[] };
}

export function stayDates(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 31; d = addDays(d, 1)) out.push(d);
  return out;
}

export function Spa() {
  const hotel = useHotel();
  const { code, stay, reload } = useStay();
  const options = useApi<Options>(`/stays/${code}/options`);
  const dates = stayDates(hotel.today > stay.checkIn ? hotel.today : stay.checkIn, stay.checkOut);
  const [treatmentId, setTreatmentId] = useState<number | null>(null);
  const [date, setDate] = useState(dates[0] ?? hotel.today);
  const [start, setStart] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [booked, setBooked] = useState<ServiceRequestDto | null>(null);
  const slots = useApi<SpaSlotDto[]>(treatmentId ? `/stays/${code}/spa/slots?date=${date}&treatmentId=${treatmentId}` : null);
  const treatment = options.data?.spa.treatments.find((t) => t.id === treatmentId);

  const book = async () => {
    if (!treatmentId || !start) return;
    setBusy(true);
    setError(null);
    try {
      setBooked(await post<ServiceRequestDto>(`/stays/${code}/spa`, { treatmentId, start, notes: notes || undefined }));
      reload();
    } catch (e) {
      setError(e as ApiError);
      setStart(null);
      slots.reload();
    } finally {
      setBusy(false);
    }
  };

  if (booked) {
    return (
      <div className="stack">
        <BackLink>Home</BackLink>
        <h1 style={{ fontSize: 'var(--step-2)' }}>Spa booked</h1>
        <LiveRequestCard r={booked} />
        <p className="small muted">Please arrive 10 minutes early at the spa on level 2. Free cancellation in the app up to {options.data!.spa.minLeadMinutes} minutes before.</p>
        <StayHomeButton />
      </div>
    );
  }

  const available = slots.data?.filter((s) => s.available) ?? [];

  return (
    <div className="stack" style={gap('1.1rem')}>
      <BackLink>Home</BackLink>
      <div>
        <h1 style={{ fontSize: 'var(--step-2)' }}>Spa</h1>
        <p className="muted" style={{ margin: 0 }}>
          Open {options.data?.spa.opensAt ?? ''} to {options.data?.spa.closesAt ?? ''}, three treatment rooms.
        </p>
      </div>
      {options.loading && <Spinner />}
      {options.data && (
        <fieldset>
          <legend style={{ fontSize: '1rem' }}>Treatment</legend>
          <div className="choice-list">
            {options.data.spa.treatments.map((t) => (
              <label key={t.id} className="choice">
                <input
                  type="radio"
                  name="treatment"
                  checked={treatmentId === t.id}
                  onChange={() => {
                    setTreatmentId(t.id);
                    setStart(null);
                  }}
                />
                <span className="choice-body">
                  <span className="choice-title">
                    <span>{t.name}</span>
                    <span className="num">{money(t.priceMinor, { whole: true })}</span>
                  </span>
                  <span className="small muted">
                    {t.durationMin} min. {t.description}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {treatmentId && (
        <fieldset className="stack" style={gap('0.75rem')}>
          <legend style={{ fontSize: '1rem' }}>Day and time</legend>
          <div className="menu-cats" role="group" aria-label="Day">
            {dates.map((d) => (
              <button
                key={d}
                className="chip"
                aria-pressed={d === date}
                onClick={() => {
                  setDate(d);
                  setStart(null);
                }}
              >
                {d === hotel.today ? 'Today' : shortDate(d)}
              </button>
            ))}
          </div>
          {slots.loading && <Spinner />}
          <ErrorNotice error={slots.error} />
          {slots.data && available.length === 0 && <Notice>No free times on this day. Try another day.</Notice>}
          {slots.data && available.length > 0 && (
            <div className="slots" role="group" aria-label="Start time">
              {slots.data.map((s) => (
                <button key={s.start} className="slot" disabled={!s.available} aria-pressed={start === s.start} onClick={() => setStart(s.start)}>
                  {s.start.slice(11)}
                </button>
              ))}
            </div>
          )}
        </fieldset>
      )}

      {treatment && start && (
        <section className="panel stack" style={gap('0.8rem')}>
          <div className="spread">
            <strong>
              {treatment.name}, {localDateTime(start)}
            </strong>
            <span className="price">{money(treatment.priceMinor)}</span>
          </div>
          <Field label="Notes for your therapist" hint="(optional)">
            <textarea maxLength={300} placeholder="Pressure preference, injuries, allergies" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <ErrorNotice error={error} />
          <button className="btn btn-accent btn-block" disabled={busy} onClick={book}>
            {busy ? 'Booking…' : 'Book treatment'}
          </button>
          <p className="small muted" style={{ margin: 0 }}>
            Added to your bill. Service charge and VAT apply.
          </p>
        </section>
      )}
      {!start && error && <ErrorNotice error={error} />}
    </div>
  );
}
