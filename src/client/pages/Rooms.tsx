import type { AvailabilityResult } from '../../shared/types';
import { ArchArt, sceneFor } from '../components/Art';
import { SearchForm, defaultSearch, searchQuery, type Search } from '../components/SearchForm';
import { ErrorNotice, Spinner } from '../components/ui';
import { useApi } from '../lib/api';
import { money, plural, shortDate } from '../lib/format';
import { useHotel } from '../lib/hotel';
import { Link, useLocation, useTitle } from '../lib/router';

export function readSearch(params: URLSearchParams, today: string): Search {
  const d = defaultSearch(today);
  return {
    checkIn: params.get('checkIn') ?? d.checkIn,
    checkOut: params.get('checkOut') ?? d.checkOut,
    adults: Number(params.get('adults') ?? d.adults),
    children: Number(params.get('children') ?? d.children),
  };
}

export function Rooms() {
  const hotel = useHotel();
  useTitle('Rooms', hotel.brand.name);
  const { search } = useLocation();
  const s = readSearch(search, hotel.today);
  const q = searchQuery(s);
  const result = useApi<AvailabilityResult>(`/availability?${q}`);

  return (
    <div className="container page">
      <h1 className="page-title" style={{ fontSize: 'var(--step-3)' }}>
        Choose your room
      </h1>
      <SearchForm key={q} initial={s} />

      <div className="stack" style={{ marginTop: '1.5rem' }}>
        <ErrorNotice error={result.error} />
        {result.loading && <Spinner label="Checking availability" />}
        {result.data && (
          <>
            <p className="muted">
              {shortDate(result.data.checkIn)} to {shortDate(result.data.checkOut)}, {plural(result.data.nights, 'night')},{' '}
              {plural(s.adults, 'adult')}
              {s.children ? `, ${plural(s.children, 'child', 'children')}` : ''}
            </p>
            {result.data.options.map((o, i) => {
              const bookable = o.available > 0 && o.fitsParty;
              return (
                <article className="result" key={o.roomType.slug}>
                  <ArchArt scene={sceneFor(o.roomType.slug, i)} label={`${o.roomType.name}, ${o.roomType.view}`} />
                  <div>
                    <h3>{o.roomType.name}</h3>
                    <p className="room-facts">
                      {o.roomType.sizeSqm} m², {o.roomType.bed}, {o.roomType.view.toLowerCase()}, sleeps {o.roomType.maxAdults} adults
                      {o.roomType.maxChildren ? ` + ${plural(o.roomType.maxChildren, 'child', 'children')}` : ''}
                    </p>
                    <p className="small">{o.roomType.description}</p>
                    <ul className="amenities">
                      {o.roomType.amenities.map((a) => (
                        <li key={a} className="tag">
                          {a}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="result-price">
                    <span className="price">{money(o.totalMinor)}</span>
                    <span className="small muted">
                      total for {plural(result.data!.nights, 'night')}, before taxes
                    </span>
                    {!o.fitsParty ? (
                      <span className="small">Too small for your party</span>
                    ) : o.available === 0 ? (
                      <span className="small">Sold out for these dates</span>
                    ) : (
                      <span className="small" style={{ color: o.available <= 2 ? 'var(--danger)' : 'var(--muted)' }}>
                        {o.available <= 2 ? `Only ${plural(o.available, 'room')} left` : `${o.available} rooms available`}
                      </span>
                    )}
                    {bookable ? (
                      <Link className="btn" href={`/book/${o.roomType.slug}?${q}`}>
                        Select
                      </Link>
                    ) : (
                      <button className="btn" disabled>
                        Select
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
            <p className="small muted">{hotel.taxesNote}</p>
          </>
        )}
      </div>
    </div>
  );
}
