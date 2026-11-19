import { useState, type FormEvent } from 'react';
import type { InvoiceDto } from '../../../shared/types';
import { ErrorNotice, Field, Notice, Spinner, gap } from '../../components/ui';
import { ApiError, post, useApi } from '../../lib/api';
import { longDate, money } from '../../lib/format';
import { forgetStay } from '../../lib/hotel';
import { Link } from '../../lib/router';
import { BillBreakdown } from './Bill';
import { useStay } from './StayApp';

export function Thanks() {
  const { code, stay, reload } = useStay();
  const invoice = useApi<InvoiceDto>(stay.status === 'checked_out' ? `/stays/${code}/invoice` : null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [sent, setSent] = useState(stay.feedbackGiven);
  const [showLines, setShowLines] = useState(false);

  if (stay.status !== 'checked_out') return <Notice>Your invoice is issued when you check out.</Notice>;

  const sendFeedback = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await post(`/stays/${code}/feedback`, { rating, comment: comment || undefined });
      setSent(true);
      reload();
    } catch (err) {
      setError(err as ApiError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack" style={gap('1.25rem')}>
      <section className="keycard" style={{ paddingTop: '2.6rem' }}>
        <div className="keycard-meta">Checked out</div>
        <div className="keycard-room" style={{ fontSize: 'clamp(2.4rem, 12vw, 3.4rem)' }}>
          Thank you, {stay.guestName.split(' ')[0]}
        </div>
        <div className="keycard-meta">We hope to see you again.</div>
      </section>

      {invoice.loading && <Spinner />}
      <ErrorNotice error={invoice.error} />
      {invoice.data && (
        <section className="panel stack" style={gap('0.6rem')}>
          <div className="bill-total">
            <span>Total paid</span>
            <span className="price">{money(invoice.data.bill.totalMinor)}</span>
          </div>
          <p className="small" style={{ margin: 0 }}>
            Invoice <strong className="num">{invoice.data.number}</strong>, paid by {invoice.data.payment.method}.
          </p>
          <p className="small muted" style={{ margin: 0 }}>
            Issued {longDate(invoice.data.issuedAt)} for room {invoice.data.roomNumber}, {longDate(invoice.data.checkIn)} to{' '}
            {longDate(invoice.data.checkOut)}.
          </p>
          <div className="row">
            <a className="btn" href={`/api/stays/${code}/invoice.pdf`} download>
              Download invoice (PDF)
            </a>
            <button type="button" className="btn-link" onClick={() => setShowLines((v) => !v)}>
              {showLines ? 'Hide' : 'Show'} details
            </button>
          </div>
          {showLines && <BillBreakdown bill={invoice.data.bill} />}
        </section>
      )}

      {sent ? (
        <Notice tone="ok">Thanks for your feedback. It goes straight to the hotel team.</Notice>
      ) : (
        <form className="panel stack" style={gap('0.8rem')} onSubmit={sendFeedback}>
          <h2 style={{ fontSize: 'var(--step-1)', margin: 0 }}>How was your stay?</h2>
          <div className="stars" role="group" aria-label="Rating out of 5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button type="button" key={n} aria-pressed={n <= rating} aria-label={`${n} out of 5`} onClick={() => setRating(n)}>
                {n}
              </button>
            ))}
          </div>
          <Field label="Anything you would like to tell us?" hint="(optional)">
            <textarea maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} />
          </Field>
          <ErrorNotice error={error} />
          <button className="btn" disabled={busy || rating === 0}>
            {busy ? 'Sending…' : 'Send feedback'}
          </button>
        </form>
      )}

      <div className="row">
        <Link className="btn btn-ghost" href="/" onClick={() => forgetStay()}>
          Book another stay
        </Link>
      </div>
    </div>
  );
}
