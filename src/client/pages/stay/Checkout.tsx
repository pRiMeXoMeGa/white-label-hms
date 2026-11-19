import { useState, type FormEvent } from 'react';
import type { CheckoutPreviewDto, InvoiceDto } from '../../../shared/types';
import { ErrorNotice, Field, Notice, Spinner, gap } from '../../components/ui';
import { ApiError, post, useApi } from '../../lib/api';
import { formatCardNumber, formatExpiry, money, plural, shortDate } from '../../lib/format';
import { navigate } from '../../lib/router';
import { BillBreakdown } from './Bill';
import { BackLink, useStay } from './StayApp';

export function Checkout() {
  const { code, base, stay, reload } = useStay();
  // The server works out exactly what check-out would charge and release, without changing anything.
  const preview = useApi<CheckoutPreviewDto>(`/stays/${code}/checkout-preview`, 15_000);
  const [method, setMethod] = useState<'card_on_file' | 'new_card'>('card_on_file');
  const [card, setCard] = useState({ holder: '', number: '', expiry: '', cvc: '' });
  const [showLines, setShowLines] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);


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

  if (preview.loading) return <Spinner />;
  if (!preview.data) return <ErrorNotice error={preview.error} />;
  const p = preview.data;
  const b = p.bill;

  return (
    <form className="stack" style={gap('1.1rem')} onSubmit={submit}>
      <BackLink>Home</BackLink>
      <h1 style={{ fontSize: 'var(--step-2)', margin: 0 }}>Check out</h1>

      {p.nightsReleased > 0 && (
        <Notice>
          You are leaving before {shortDate(stay.checkOut)}. {plural(p.nightsReleased, 'unused night')} from{' '}
          {shortDate(p.checkOut)} onwards {p.nightsReleased === 1 ? 'is' : 'are'} released and taken off your bill; at least one
          night is always charged.
        </Notice>
      )}
      {p.servicesReleased.length > 0 && (
        <Notice>
          These bookings have not started yet and are cancelled and refunded at check-out: {p.servicesReleased.join('; ')}.
        </Notice>
      )}

      <section className="panel stack" style={gap('0.6rem')}>
        <div className="bill-total">
          <span>Total due</span>
          <span className="price">{money(p.dueMinor)}</span>
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          Including {money(b.taxTotalMinor)} taxes and fees, after any released nights and bookings above.
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
              <span className="choice-title">{stay.cardOnFile ?? 'Card used to book'}</span>
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
        {busy ? 'Checking you out…' : `Pay ${money(p.dueMinor)} and check out`}
      </button>
      <p className="small muted" style={{ margin: 0 }}>
        Leave your key card in the room or at reception. Your invoice will be ready to download straight away.
      </p>
    </form>
  );
}
