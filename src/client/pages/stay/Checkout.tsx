import { useState, type FormEvent } from 'react';
import type { BillDto, InvoiceDto, ServiceRequestDto } from '../../../shared/types';
import { ErrorNotice, Field, Notice, Spinner, gap } from '../../components/ui';
import { ApiError, post, useApi } from '../../lib/api';
import { formatCardNumber, formatExpiry, money, shortDate } from '../../lib/format';
import { useHotel } from '../../lib/hotel';
import { navigate } from '../../lib/router';
import { BillBreakdown } from './Bill';
import { BackLink, useStay } from './StayApp';

export function Checkout() {
  const hotel = useHotel();
  const { code, base, stay, reload } = useStay();
  const bill = useApi<BillDto>(`/stays/${code}/bill`);
  const requests = useApi<ServiceRequestDto[]>(`/stays/${code}/requests`);
  const [method, setMethod] = useState<'card_on_file' | 'new_card'>('card_on_file');
  const [card, setCard] = useState({ holder: '', number: '', expiry: '', cvc: '' });
  const [showLines, setShowLines] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const early = hotel.today < stay.checkOut && hotel.today >= stay.checkIn;
  const futureSpa = requests.data?.filter((r) => r.service === 'spa' && !r.isFinal && !r.isCancelled) ?? [];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await post<InvoiceDto>(
        `/stays/${code}/checkout`,
        method === 'card_on_file' ? { method } : { method, holder: card.holder, number: card.number, expiry: card.expiry },
      );
      reload();
      navigate(`${base}/thanks`, { replace: true });
    } catch (err) {
      setError(err as ApiError);
      setBusy(false);
    }
  };

  if (bill.loading) return <Spinner />;
  if (!bill.data) return <ErrorNotice error={bill.error} />;
  const b = bill.data;

  return (
    <form className="stack" style={gap('1.1rem')} onSubmit={submit}>
      <BackLink>Home</BackLink>
      <h1 style={{ fontSize: 'var(--step-2)', margin: 0 }}>Check out</h1>

      {early && (
        <Notice>
          You are leaving before {shortDate(stay.checkOut)}. Nights after tonight are released and taken off your bill when you
          check out.
        </Notice>
      )}
      {futureSpa.length > 0 && <Notice>Spa bookings that have not started yet will be cancelled and refunded.</Notice>}

      <section className="panel stack" style={gap('0.6rem')}>
        <div className="bill-total">
          <span>Total due</span>
          <span className="price">{money(b.balanceMinor)}</span>
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          Including {money(b.taxTotalMinor)} taxes and fees. The final amount reflects any early-departure adjustments.
        </p>
        <button type="button" className="btn-link" aria-expanded={showLines} onClick={() => setShowLines((v) => !v)}>
          {showLines ? 'Hide' : 'Show'} itemised bill
        </button>
        {showLines && <BillBreakdown bill={b} />}
      </section>

      <fieldset>
        <legend style={{ fontSize: '1rem' }}>Pay with</legend>
        <div className="choice-list">
          <label className="choice">
            <input type="radio" name="method" checked={method === 'card_on_file'} onChange={() => setMethod('card_on_file')} />
            <span className="choice-body">
              <span className="choice-title">Card used to book</span>
              <span className="small muted">The card that guaranteed your booking</span>
            </span>
          </label>
          <label className="choice">
            <input type="radio" name="method" checked={method === 'new_card'} onChange={() => setMethod('new_card')} />
            <span className="choice-body">
              <span className="choice-title">A different card</span>
            </span>
          </label>
        </div>
      </fieldset>

      {method === 'new_card' && (
        <section className="panel stack">
          <Field label="Name on card">
            <input required autoComplete="cc-name" value={card.holder} onChange={(e) => setCard({ ...card, holder: e.target.value })} />
          </Field>
          <Field label="Card number" hint="(demo: 4242 4242 4242 4242)">
            <input required inputMode="numeric" autoComplete="cc-number" value={card.number} onChange={(e) => setCard({ ...card, number: formatCardNumber(e.target.value) })} />
          </Field>
          <div className="grid-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Field label="Expiry">
              <input required placeholder="MM/YY" inputMode="numeric" value={card.expiry} onChange={(e) => setCard({ ...card, expiry: formatExpiry(e.target.value) })} />
            </Field>
            <Field label="Security code">
              <input required inputMode="numeric" pattern="\d{3,4}" maxLength={4} value={card.cvc} onChange={(e) => setCard({ ...card, cvc: e.target.value.replace(/\D/g, '') })} />
            </Field>
          </div>
        </section>
      )}

      <ErrorNotice error={error} />
      <button className="btn btn-accent btn-block" disabled={busy}>
        {busy ? 'Checking you out…' : early ? 'Pay and check out' : `Pay ${money(b.balanceMinor)} and check out`}
      </button>
      <p className="small muted" style={{ margin: 0 }}>
        Leave your key card in the room or at reception. Your invoice will be ready to download straight away.
      </p>
    </form>
  );
}
