import { Icon } from '../../components/Icons';
import { gap } from '../../components/ui';
import { Link } from '../../lib/router';
import { SERVICES } from './StayHome';
import { useStay } from './StayApp';

export function Services() {
  const { base } = useStay();
  return (
    <div className="stack" style={gap('0.6rem')}>
      <h1 style={{ fontSize: 'var(--step-2)' }}>Services</h1>
      {SERVICES.map((s) => {
        const I = Icon[s.icon];
        return (
          <Link key={s.to} href={`${base}${s.to}`} className="choice" style={{ textDecoration: 'none', color: 'inherit' }}>
            <span className="tile-icon" style={{ flex: 'none' }}>
              <I />
            </span>
            <span className="choice-body">
              <span className="choice-title">{s.label}</span>
              <span className="small muted">{s.blurb}</span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
