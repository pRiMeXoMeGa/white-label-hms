import { useState, type FormEvent } from 'react';
import { addDays } from '../lib/format';
import { useHotel } from '../lib/hotel';
import { navigate } from '../lib/router';
import { Field } from './ui';

export interface Search {
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
}

export function searchQuery(s: Search) {
  return new URLSearchParams({
    checkIn: s.checkIn,
    checkOut: s.checkOut,
    adults: String(s.adults),
    children: String(s.children),
  }).toString();
}

export function defaultSearch(today: string): Search {
  return { checkIn: today, checkOut: addDays(today, 2), adults: 2, children: 0 };
}

export function SearchForm({ initial }: { initial?: Search }) {
  const hotel = useHotel();
  const [s, setS] = useState<Search>(initial ?? defaultSearch(hotel.today));
  const set = (patch: Partial<Search>) => setS((prev) => ({ ...prev, ...patch }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!s.checkIn || !s.checkOut || s.checkOut <= s.checkIn) return;
    navigate(`/rooms?${searchQuery(s)}`);
  };

  return (
    <form className="search" onSubmit={submit} aria-label="Find a room">
      <Field label="Check-in">
        <input
          type="date"
          required
          min={hotel.today}
          value={s.checkIn}
          onChange={(e) => {
            const checkIn = e.target.value;
            // A cleared field leaves check-out alone; a later check-in pushes check-out forward.
            set({ checkIn, checkOut: checkIn && s.checkOut <= checkIn ? addDays(checkIn, 1) : s.checkOut });
          }}
        />
      </Field>
      <Field label="Check-out">
        <input type="date" required min={addDays(s.checkIn, 1) || addDays(hotel.today, 1)} value={s.checkOut} onChange={(e) => set({ checkOut: e.target.value })} />
      </Field>
      <Field label="Adults">
        <select value={s.adults} onChange={(e) => set({ adults: Number(e.target.value) })}>
          {[1, 2, 3, 4].map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
      </Field>
      <Field label="Children">
        <select value={s.children} onChange={(e) => set({ children: Number(e.target.value) })}>
          {[0, 1, 2, 3].map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
      </Field>
      <button className="btn btn-accent" type="submit">
        Check availability
      </button>
    </form>
  );
}
