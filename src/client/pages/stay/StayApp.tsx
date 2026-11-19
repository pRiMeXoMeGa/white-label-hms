import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { StayDto } from '../../../shared/types';
import { Icon } from '../../components/Icons';
import { Wordmark } from '../../components/SiteLayout';
import { ErrorNotice, Field, Notice, Spinner } from '../../components/ui';
import { useApi } from '../../lib/api';
import { forgetStay, rememberStay, rememberedStay, useHotel } from '../../lib/hotel';
import { Link, matchPath, navigate, useLocation, useTitle } from '../../lib/router';
import { Bill } from './Bill';
import { CatalogOrder } from './CatalogOrder';
import { Checkout } from './Checkout';
import { Info } from './Info';
import { Maintenance } from './Maintenance';
import { RequestsPage } from './Requests';
import { Services } from './Services';
import { Spa } from './Spa';
import { StayHome } from './StayHome';
import { Thanks } from './Thanks';
import { Transfer } from './Transfer';

interface StayCtx {
  code: string;
  stay: StayDto;
  reload: () => void;
  base: string;
}

const Ctx = createContext<StayCtx | null>(null);

export function useStay(): StayCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useStay outside StayApp');
  return c;
}

export function BackLink({ to = '', children = 'Back' }: { to?: string; children?: ReactNode }) {
  const { base } = useStay();
  return (
    <Link href={`${base}${to}`} className="back">
      <span style={{ width: 18, display: 'inline-block' }}>
        <Icon.back />
      </span>
      {children}
    </Link>
  );
}

const TABS = [
  { to: '', label: 'Home', icon: Icon.home },
  { to: '/services', label: 'Services', icon: Icon.grid },
  { to: '/bill', label: 'Bill', icon: Icon.bill },
  { to: '/info', label: 'Hotel info', icon: Icon.info },
] as const;

function Shell({ children, showTabs }: { children: ReactNode; showTabs: boolean }) {
  const hotel = useHotel();
  const { pathname } = useLocation();
  const { base } = useStay();
  return (
    <div className="app-shell">
      <div className="app">
        <div className="app-top">
          <Wordmark name={hotel.brand.shortName} />
          <a className="small" href={`tel:${hotel.contact.phone.replace(/\s/g, '')}`}>
            Call reception
          </a>
        </div>
        {children}
      </div>
      {showTabs && (
        <div className="tabbar">
          <nav aria-label="Stay">
            {TABS.map((t) => {
              const href = `${base}${t.to}`;
              const active = t.to === '' ? pathname === base : pathname.startsWith(href);
              return (
                <Link key={t.label} href={href} aria-current={active ? 'page' : undefined}>
                  <t.icon />
                  {t.label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </div>
  );
}

export function StayApp() {
  const hotel = useHotel();
  const { pathname } = useLocation();
  const params = matchPath('/stay/:code', pathname) ?? matchPath('/stay/:code/:section', pathname);
  const code = params?.code ?? '';
  const section = params?.section ?? '';
  const base = `/stay/${code}`;
  const stay = useApi<StayDto>(code ? `/stays/${code}` : null, 15_000);
  useTitle('My stay', hotel.brand.name);

  useEffect(() => {
    if (stay.data) rememberStay(stay.data.stayCode);
  }, [stay.data]);

  const closed = stay.data?.status === 'checked_out';
  useEffect(() => {
    if (closed && section !== 'thanks' && section !== 'bill') navigate(`${base}/thanks`, { replace: true });
  }, [closed, section, base]);

  if (stay.error) {
    if (stay.error.status === 404 && rememberedStay() === code) forgetStay();
    const gone = stay.error.status === 404;
    return (
      <div className="app" style={{ paddingTop: '2rem' }}>
        {gone ? (
          <Notice tone="error">
            We could not find stay {code}. This is a demo: its data is cleared whenever the server is updated or
            restarted, so stays from before that are no longer available. You can <Link href="/">book a new stay</Link> and
            check in again, or enter a different Stay ID below.
          </Notice>
        ) : (
          <ErrorNotice error={stay.error} />
        )}
        <div style={{ marginTop: '1rem' }}>
          <StayEntryForm />
        </div>
      </div>
    );
  }
  if (!stay.data) return <Spinner />;

  const value: StayCtx = { code, stay: stay.data, reload: stay.reload, base };
  let page: ReactNode;
  switch (section) {
    case '':
      page = <StayHome />;
      break;
    case 'services':
      page = <Services />;
      break;
    case 'dining':
      page = <CatalogOrder service="food" />;
      break;
    case 'laundry':
      page = <CatalogOrder service="laundry" />;
      break;
    case 'amenities':
      page = <CatalogOrder service="amenity" />;
      break;
    case 'housekeeping':
      page = <CatalogOrder service="housekeeping" />;
      break;
    case 'maintenance':
      page = <Maintenance />;
      break;
    case 'spa':
      page = <Spa />;
      break;
    case 'transfer':
      page = <Transfer />;
      break;
    case 'requests':
      page = <RequestsPage />;
      break;
    case 'info':
      page = <Info />;
      break;
    case 'bill':
      page = <Bill />;
      break;
    case 'checkout':
      page = <Checkout />;
      break;
    case 'thanks':
      page = <Thanks />;
      break;
    default:
      page = <Notice>That page does not exist.</Notice>;
  }

  return (
    <Ctx.Provider value={value}>
      <Shell showTabs={!closed && section !== 'checkout'}>{page}</Shell>
    </Ctx.Provider>
  );
}

function StayEntryForm() {
  const [code, setCode] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    navigate(`/stay/${code.trim().toUpperCase()}`);
  };
  return (
    <form className="panel stack" onSubmit={submit}>
      <Field label="Stay ID" hint="(shown after online check-in)">
        <input required placeholder="ABCD-EFGH-JKLM" autoCapitalize="characters" value={code} onChange={(e) => setCode(e.target.value)} />
      </Field>
      <button className="btn">Open my stay</button>
      <p className="small muted" style={{ margin: 0 }}>
        Lost your Stay ID? Find it under <Link href="/manage">Manage booking</Link> with your booking reference and last name. Not
        checked in yet? <Link href="/check-in">Check in online</Link>.
      </p>
    </form>
  );
}

/** /stay without an ID: reopen the remembered stay, or ask for the Stay ID. */
export function StayEntry() {
  const hotel = useHotel();
  useTitle('My stay', hotel.brand.name);
  const remembered = rememberedStay();
  useEffect(() => {
    if (remembered) navigate(`/stay/${remembered}`, { replace: true });
  }, [remembered]);
  return (
    <div className="container page" style={{ maxWidth: 560 }}>
      <h1 className="page-title" style={{ fontSize: 'var(--step-3)' }}>
        My stay
      </h1>
      <StayEntryForm />
    </div>
  );
}
