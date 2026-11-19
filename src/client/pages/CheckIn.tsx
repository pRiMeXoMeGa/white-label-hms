import { useState, type FormEvent } from 'react';
import type { ReservationDto, StayDto } from '../../shared/types';
import { ErrorNotice, Field, gap } from '../components/ui';
import { ApiError, post } from '../lib/api';
import { rememberStay, useHotel } from '../lib/hotel';
import { Link, useLocation, useTitle } from '../lib/router';

function prefillLastName(code: string): string {
  try {
    const raw = sessionStorage.getItem(`booking:${code}`);
    return raw ? (JSON.parse(raw) as ReservationDto).guest.lastName : '';
  } catch {
    return '';
  }
}

export function CheckIn() {
  const hotel = useHotel();
  useTitle('Online check-in', hotel.brand.name);
  const { search } = useLocation();
  const initialCode = search.get('code') ?? '';
  const [form, setForm] = useState({
    code: initialCode,
    lastName: prefillLastName(initialCode),
    nationality: '',
    idType: 'passport',
    idNumber: '',
    arrivalTime: '15:00',
  });
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [stay, setStay] = useState<StayDto | null>(null);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const s = await post<StayDto>('/check-in', { ...form, code: form.code.trim(), acceptTerms: agree });
      rememberStay(s.stayCode);
      setStay(s);
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setBusy(false);
    }
  };

  if (stay) {
    const link = `${window.location.origin}/stay/${stay.stayCode}`;
    return (
      <div className="container page" style={{ maxWidth: 640 }}>
        <section className="keycard">
          <div className="keycard-meta">Welcome, {stay.guestName.split(' ')[0]}. Your room is</div>
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
              Booking
              <strong>{stay.reservationCode}</strong>
            </div>
          </div>
        </section>
        <div className="panel stack" style={{ marginTop: '1rem' }}>
          <p style={{ margin: 0 }}>
            You are checked in. Your Stay ID opens your in-stay app on any device: order food, book the spa, request laundry and
            check out. We have saved it on this device.
          </p>
          <p className="small muted" style={{ margin: 0 }}>
            Your link: <span style={{ wordBreak: 'break-all' }}>{link}</span>
          </p>
          <div className="row">
            <Link className="btn btn-accent" href={`/stay/${stay.stayCode}`}>
              Open my stay
            </Link>
            <button className="btn btn-ghost" onClick={() => navigator.clipboard?.writeText(link)}>
              Copy link
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container page" style={{ maxWidth: 720 }}>
      <h1 className="page-title" style={{ fontSize: 'var(--step-3)' }}>
        Online check-in
      </h1>
      <form className="stack" onSubmit={submit} style={gap('1.25rem')}>
        <fieldset className="panel stack">
          <legend>Find your booking</legend>
          <div className="grid-2">
            <Field label="Booking reference">
              <input required placeholder="SB-7K3QXA" autoCapitalize="characters" value={form.code} onChange={(e) => set({ code: e.target.value.toUpperCase() })} />
            </Field>
            <Field label="Last name">
              <input required autoComplete="family-name" value={form.lastName} onChange={(e) => set({ lastName: e.target.value })} />
            </Field>
          </div>
        </fieldset>
        <fieldset className="panel stack">
          <legend>Your ID</legend>
          <p className="small muted" style={{ margin: 0 }}>
            UAE hotels must register every guest. We keep only the last four characters of your document number; reception
            checks the original document when you collect your key.
          </p>
          <div className="grid-2">
            <Field label="Nationality">
              <input required autoComplete="country-name" value={form.nationality} onChange={(e) => set({ nationality: e.target.value })} />
            </Field>
            <Field label="Document">
              <select value={form.idType} onChange={(e) => set({ idType: e.target.value })}>
                <option value="passport">Passport</option>
                <option value="emirates_id">Emirates ID</option>
                <option value="national_id">National ID card</option>
              </select>
            </Field>
            <Field label="Document number">
              <input required minLength={5} value={form.idNumber} onChange={(e) => set({ idNumber: e.target.value })} />
            </Field>
            <Field label="Expected arrival time">
              <input type="time" value={form.arrivalTime} onChange={(e) => set({ arrivalTime: e.target.value })} />
            </Field>
          </div>
        </fieldset>
        <label className="check">
          <input type="checkbox" required checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span>I confirm these details are correct and accept the house rules.</span>
        </label>
        <ErrorNotice error={error} />
        <button className="btn btn-accent btn-block" disabled={busy}>
          {busy ? 'Checking you in…' : 'Check in'}
        </button>
      </form>
    </div>
  );
}
