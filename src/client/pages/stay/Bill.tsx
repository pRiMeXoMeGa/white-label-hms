import type { BillDto, TaxLine } from '../../../shared/types';
import { ErrorNotice, Spinner, gap } from '../../components/ui';
import { useApi } from '../../lib/api';
import { money, shortDate } from '../../lib/format';
import { Link } from '../../lib/router';
import { useStay } from './StayApp';

export function taxLabel(t: TaxLine): string {
  return t.kind === 'percent'
    ? `${t.name} ${t.ratePercent}%`
    : `${t.name}, ${money(t.unitMinor)} × ${t.roomNights} ${t.roomNights === 1 ? 'night' : 'nights'}`;
}

export function BillBreakdown({ bill }: { bill: BillDto }) {
  return (
    <>
      <ul className="bill-lines">
        {bill.lines.map((l, i) => (
          <li key={i}>
            <span>
              {l.description}
              <span className="small muted" style={{ display: 'block' }}>
                {shortDate(l.date)}
                {Math.abs(l.quantity) > 1 ? `, ${Math.abs(l.quantity)} × ${money(l.unitMinor)}` : ''}
              </span>
            </span>
            <span className={`amount${l.amountMinor < 0 ? ' negative' : ''}`}>{money(l.amountMinor)}</span>
          </li>
        ))}
      </ul>
      <ul className="bill-lines" style={{ marginTop: '0.75rem', borderTop: '2px solid var(--line)' }}>
        <li>
          <strong>Subtotal</strong>
          <span className="amount">{money(bill.subtotalMinor)}</span>
        </li>
        {bill.taxes.map((t) => (
          <li key={t.code}>
            <span className="muted">{taxLabel(t)}</span>
            <span className="amount">{money(t.amountMinor)}</span>
          </li>
        ))}
        {bill.paidMinor > 0 && (
          <li>
            <span className="muted">Paid</span>
            <span className="amount negative">{money(-bill.paidMinor)}</span>
          </li>
        )}
      </ul>
    </>
  );
}

export function Bill() {
  const { code, base, stay } = useStay();
  const bill = useApi<BillDto>(`/stays/${code}/bill`, 10_000);
  if (bill.loading) return <Spinner />;
  if (!bill.data) return <ErrorNotice error={bill.error} />;
  const b = bill.data;

  return (
    <div className="stack" style={gap('1rem')}>
      <h1 style={{ fontSize: 'var(--step-2)', margin: 0 }}>{b.isFinal ? 'Final bill' : 'Your bill so far'}</h1>
      <section className="panel">
        <div className="bill-total" style={{ marginBottom: '0.75rem' }}>
          <span>{b.isFinal ? 'Total paid' : 'Balance'}</span>
          <span className="price">{money(b.isFinal ? b.totalMinor : b.balanceMinor)}</span>
        </div>
        <BillBreakdown bill={b} />
        {b.notes.map((n) => (
          <p key={n} className="small muted" style={{ margin: '0.75rem 0 0' }}>
            {n}
          </p>
        ))}
      </section>
      {stay.status === 'checked_in' ? (
        <Link className="btn btn-accent btn-block" href={`${base}/checkout`}>
          Check out and pay
        </Link>
      ) : (
        <Link className="btn btn-block" href={`${base}/thanks`}>
          Invoice and receipt
        </Link>
      )}
    </div>
  );
}
