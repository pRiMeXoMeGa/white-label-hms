import { useMemo, useState } from 'react';
import type { CatalogItemDto, ServiceRequestDto } from '../../../shared/types';
import { ErrorNotice, Field, Qty, Spinner, gap } from '../../components/ui';
import { ApiError, post, useApi } from '../../lib/api';
import { hotelNowLocal, money } from '../../lib/format';
import { useHotel } from '../../lib/hotel';
import { Link } from '../../lib/router';
import { LiveRequestCard } from './RequestCard';
import { BackLink, useStay } from './StayApp';

type CatalogService = 'food' | 'laundry' | 'amenity' | 'housekeeping';

const COPY: Record<CatalogService, { title: string; lede: string; action: string; notes: string }> = {
  food: {
    title: 'In-room dining',
    lede: 'Delivered to your room in about 30 minutes, 24 hours a day.',
    action: 'Place order',
    notes: 'Allergies or preferences',
  },
  laundry: {
    title: 'Laundry',
    lede: 'Leave your items in the laundry bag. Regular service is back the next day; express the same day.',
    action: 'Request pickup',
    notes: 'Notes for the laundry team',
  },
  amenity: {
    title: 'Amenities',
    lede: 'Free of charge, brought to your room.',
    action: 'Send request',
    notes: 'Anything else we should know',
  },
  housekeeping: {
    title: 'Housekeeping',
    lede: 'Free of charge. Tell us what you need and when suits you.',
    action: 'Send request',
    notes: 'Preferred time or details',
  },
};

interface Options {
  laundryExpressSurchargePercent: number;
}

const PICKUP_TIMES = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00'];

export function CatalogOrder({ service }: { service: CatalogService }) {
  const hotel = useHotel();
  const { code, reload } = useStay();
  const copy = COPY[service];
  const items = useApi<CatalogItemDto[]>(`/stays/${code}/catalog/${service}`);
  const options = useApi<Options>(service === 'laundry' ? `/stays/${code}/options` : null);
  const [qty, setQty] = useState<Record<number, number>>({});
  const [category, setCategory] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [express, setExpress] = useState(false);
  const [pickupTime, setPickupTime] = useState('10:00');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [placed, setPlaced] = useState<ServiceRequestDto | null>(null);
  // Only pickup times still ahead today; after the last one, the times are for tomorrow.
  const nowHm = hotelNowLocal(hotel.timezone).slice(11);
  const laterToday = PICKUP_TIMES.filter((t) => t > nowHm);
  const pickupChoices = laterToday.length ? laterToday : PICKUP_TIMES;
  const pickupSuffix = laterToday.length ? '' : ' tomorrow';
  const pickup = pickupChoices.includes(pickupTime) ? pickupTime : pickupChoices[0]!;

  const categories = useMemo(() => [...new Set(items.data?.map((i) => i.category) ?? [])], [items.data]);
  const visible = items.data?.filter((i) => service !== 'food' || !category || i.category === category) ?? [];
  const lines = (items.data ?? []).filter((i) => (qty[i.id] ?? 0) > 0);
  const count = lines.reduce((n, i) => n + (qty[i.id] ?? 0), 0);
  const base = lines.reduce((n, i) => n + (qty[i.id] ?? 0) * i.priceMinor, 0);
  const surcharge = express && options.data ? Math.round((base * options.data.laundryExpressSurchargePercent) / 100) : 0;
  const total = base + surcharge;
  const paid = items.data?.some((i) => i.priceMinor > 0) ?? false;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await post<ServiceRequestDto>(`/stays/${code}/orders/${service}`, {
        items: lines.map((i) => ({ itemId: i.id, quantity: qty[i.id] })),
        notes: notes || undefined,
        ...(service === 'laundry' ? { express, pickupTime: pickup } : {}),
      });
      setPlaced(r);
      setQty({});
      reload();
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setBusy(false);
    }
  };

  if (placed) {
    return (
      <div className="stack">
        <BackLink>Home</BackLink>
        <h1 style={{ fontSize: 'var(--step-2)' }}>{service === 'food' ? 'Order placed' : 'Request sent'}</h1>
        <LiveRequestCard r={placed} />
        <p className="small muted">You can follow its status on the home screen.{placed.totalMinor > 0 && ' It has been added to your bill.'}</p>
        <div className="row">
          <StayHomeButton />
          <button className="btn btn-ghost" onClick={() => setPlaced(null)}>
            {service === 'food' ? 'Order something else' : 'Make another request'}
          </button>
        </div>
      </div>
    );
  }

  const grouped: Array<[string | null, CatalogItemDto[]]> =
    service === 'food' ? [[null, visible]] : categories.map((c) => [c, visible.filter((i) => i.category === c)]);

  return (
    <div className="stack" style={{ ...gap('1rem'), paddingBottom: count ? '4.5rem' : 0 }}>
      <BackLink>Home</BackLink>
      <div>
        <h1 style={{ fontSize: 'var(--step-2)' }}>{copy.title}</h1>
        <p className="muted" style={{ margin: 0 }}>
          {copy.lede}
        </p>
      </div>
      {items.loading && <Spinner />}
      <ErrorNotice error={items.error} />

      {service === 'food' && categories.length > 1 && (
        <div className="menu-cats" role="group" aria-label="Menu sections">
          <button className="chip" aria-pressed={category === null} onClick={() => setCategory(null)}>
            Everything
          </button>
          {categories.map((c) => (
            <button key={c} className="chip" aria-pressed={category === c} onClick={() => setCategory(c)}>
              {c}
            </button>
          ))}
        </div>
      )}

      {grouped.map(([group, list]) => (
        <section key={group ?? 'all'} className="stack" style={gap('0.5rem')}>
          {group && <h2 style={{ fontSize: '1rem', margin: '0.5rem 0 0' }}>{group}</h2>}
          <div className="menu">
            {list.map((i) => (
              <div className="menu-item" key={i.id}>
                <div>
                  <h4>{i.name}</h4>
                  {i.description && <p>{i.description}</p>}
                  <p>
                    {i.priceMinor > 0 ? <span className="num" style={{ color: 'var(--ink)', fontWeight: 600 }}>{money(i.priceMinor)}</span> : 'Free'}
                    {i.tags.length > 0 && <span> ({i.tags.join(', ')})</span>}
                  </p>
                </div>
                <Qty label={i.name} value={qty[i.id] ?? 0} max={service === 'food' || service === 'laundry' ? 20 : 4} onChange={(n) => setQty({ ...qty, [i.id]: n })} />
              </div>
            ))}
          </div>
        </section>
      ))}

      {items.data && (
        <section className="panel stack" style={gap('0.9rem')}>
          {service === 'laundry' && options.data && (
            <>
              <label className="check">
                <input type="checkbox" checked={express} onChange={(e) => setExpress(e.target.checked)} />
                <span>
                  Express, back the same day (+{options.data.laundryExpressSurchargePercent}%)
                </span>
              </label>
              <Field label="Pickup from your room">
                <select value={pickup} onChange={(e) => setPickupTime(e.target.value)}>
                  {pickupChoices.map((t) => (
                    <option key={t} value={t}>
                      {t}
                      {pickupSuffix}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          )}
          <Field label={copy.notes} hint="(optional)">
            <textarea maxLength={300} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <ErrorNotice error={error} />
          {!paid && (
            <button className="btn btn-block" disabled={busy || count === 0} onClick={submit}>
              {busy ? 'Sending…' : count ? copy.action : 'Choose at least one item'}
            </button>
          )}
        </section>
      )}

      {paid && count > 0 && (
        <div className="cartbar">
          <div className="cartbar-inner">
            <span>
              {count} {count === 1 ? 'item' : 'items'}, <strong className="num">{money(total)}</strong>
              {surcharge > 0 && <span className="small"> incl. express</span>}
            </span>
            <button className="btn btn-accent" disabled={busy} onClick={submit}>
              {busy ? 'Sending…' : copy.action}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function StayHomeButton() {
  const { base } = useStay();
  return (
    <Link className="btn" href={base}>
      Back to home
    </Link>
  );
}
