import { useState } from 'react';
import type { StayInfo } from '../../../shared/types';
import { ErrorNotice, Spinner, gap } from '../../components/ui';
import { useApi } from '../../lib/api';
import { useStay } from './StayApp';

export function Info() {
  const { code } = useStay();
  const info = useApi<StayInfo>(`/stays/${code}/info`);
  const [copied, setCopied] = useState(false);

  if (info.loading) return <Spinner />;
  if (!info.data) return <ErrorNotice error={info.error} />;
  const { wifi, hours, houseRules, localGuide, contact } = info.data;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(wifi.password);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard can be blocked; the password is visible anyway */
    }
  };

  return (
    <div className="stack" style={gap('1.25rem')}>
      <h1 style={{ fontSize: 'var(--step-2)', margin: 0 }}>Hotel info</h1>

      <section className="panel wifi" aria-labelledby="wifi-title">
        <h2 id="wifi-title" style={{ fontSize: 'var(--step-1)' }}>
          Wi-Fi
        </h2>
        <span className="small muted">Network</span>
        <strong>{wifi.network}</strong>
        <span className="small muted" style={{ marginTop: '0.5rem' }}>
          Password
        </span>
        <div className="spread" style={{ alignItems: 'center' }}>
          <code>{wifi.password}</code>
          <button className="btn btn-ghost" onClick={copy}>
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        {wifi.note && (
          <p className="small muted" style={{ margin: '0.5rem 0 0' }}>
            {wifi.note}
          </p>
        )}
      </section>

      <section className="panel" aria-labelledby="hours-title">
        <h2 id="hours-title" style={{ fontSize: 'var(--step-1)' }}>
          Opening hours
        </h2>
        <ul className="info-list">
          {hours.map((h) => (
            <li key={h.name}>
              <div className="spread">
                <strong>{h.name}</strong>
                <span className="small muted" style={{ textAlign: 'right' }}>
                  {h.place}
                </span>
              </div>
              <span className="small">{h.hours}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel" aria-labelledby="guide-title">
        <h2 id="guide-title" style={{ fontSize: 'var(--step-1)' }}>
          Around the hotel
        </h2>
        <ul className="info-list">
          {localGuide.map((g) => (
            <li key={g.name}>
              <div className="spread">
                <strong>{g.name}</strong>
                <span className="small num muted">{g.distanceKm < 1 ? `${Math.round(g.distanceKm * 1000)} m` : `${g.distanceKm} km`}</span>
              </div>
              <span className="tag">{g.category}</span>
              <p className="small" style={{ margin: '0.35rem 0 0' }}>
                {g.description}
                {g.tip && <span className="muted"> {g.tip}</span>}
              </p>
            </li>
          ))}
        </ul>
        <p className="small muted" style={{ margin: '0.5rem 0 0' }}>
          Distances are approximate, by road. The concierge can book taxis and tours.
        </p>
      </section>

      <section className="panel" aria-labelledby="rules-title">
        <h2 id="rules-title" style={{ fontSize: 'var(--step-1)' }}>
          House rules
        </h2>
        <ul className="info-list">
          {houseRules.map((r) => (
            <li key={r} className="small">
              {r}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel-flat small">
        Reception, 24 hours: <a href={`tel:${contact.phone.replace(/\s/g, '')}`}>{contact.phone}</a>
        {contact.whatsapp && (
          <>
            <br />
            WhatsApp: {contact.whatsapp}
          </>
        )}
      </section>
    </div>
  );
}
