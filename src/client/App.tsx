import type { PublicHotel } from '../shared/types';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SiteLayout } from './components/SiteLayout';
import { LiveRegion } from './lib/announce';
import { ErrorNotice, Spinner } from './components/ui';
import { useApi } from './lib/api';
import { configureFormat } from './lib/format';
import { HotelContext } from './lib/hotel';
import { matchPath, useLocation } from './lib/router';
import { Book } from './pages/Book';
import { CheckIn } from './pages/CheckIn';
import { Confirmation } from './pages/Confirmation';
import { Home } from './pages/Home';
import { ManageBooking } from './pages/ManageBooking';
import { NotFound } from './pages/NotFound';
import { Rooms } from './pages/Rooms';
import { StayApp, StayEntry } from './pages/stay/StayApp';

export function App() {
  const hotel = useApi<PublicHotel>('/hotel');
  const { pathname } = useLocation();

  if (hotel.error) {
    return (
      <div className="container page">
        <ErrorNotice error={hotel.error} />
      </div>
    );
  }
  if (!hotel.data) return <Spinner />;
  configureFormat(hotel.data.locale, hotel.data.currency);

  // The in-stay app has its own mobile shell; everything else uses the website layout.
  let page;
  const stayPath = matchPath('/stay/:code', pathname) ?? matchPath('/stay/:code/:section', pathname);
  if (stayPath?.code?.trim()) {
    page = <StayApp />;
  } else {
    let p: Record<string, string> | null;
    if (pathname === '/') page = <Home />;
    else if (pathname === '/rooms') page = <Rooms />;
    else if ((p = matchPath('/book/:slug', pathname))) page = <Book slug={p.slug!} />;
    else if ((p = matchPath('/booking/:code', pathname))) page = <Confirmation code={p.code!} />;
    else if (pathname === '/manage') page = <ManageBooking />;
    else if (pathname === '/check-in') page = <CheckIn />;
    else if (pathname === '/stay' || pathname.startsWith('/stay/')) page = <StayEntry />;
    else page = <NotFound />;
    page = <SiteLayout>{page}</SiteLayout>;
  }

  return (
    <HotelContext.Provider value={hotel.data}>
      <ErrorBoundary>{page}</ErrorBoundary>
      <LiveRegion />
    </HotelContext.Provider>
  );
}
