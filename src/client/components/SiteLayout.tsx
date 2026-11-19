import type { ReactNode } from 'react';
import { rememberedStay, useHotel } from '../lib/hotel';
import { Link, useLocation } from '../lib/router';

export function Wordmark({ name }: { name: string }) {
  return (
    <Link href="/" className="wordmark">
      <span className="wordmark-sun" aria-hidden="true" />
      {name}
    </Link>
  );
}

export function SiteLayout({ children }: { children: ReactNode }) {
  const hotel = useHotel();
  const { pathname } = useLocation();
  const stay = rememberedStay();
  const nav: Array<[string, string]> = [
    ['/rooms', 'Rooms'],
    ['/manage', 'Manage booking'],
    ['/check-in', 'Online check-in'],
    [stay ? `/stay/${stay}` : '/stay', 'My stay'],
  ];
  return (
    <>
      <header className="site-header">
        <div className="container">
          <Wordmark name={hotel.brand.shortName} />
          <nav className="site-nav" aria-label="Main">
            {nav.map(([href, label]) => (
              <Link key={href} href={href} aria-current={pathname.startsWith(href.split('/').slice(0, 2).join('/')) ? 'page' : undefined}>
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main>{children}</main>
      <footer className="site-footer">
        <div className="container">
          <div>
            <strong>{hotel.brand.name}</strong>
            <br />
            {hotel.contact.address}
          </div>
          <div>
            Reception <a href={`tel:${hotel.contact.phone.replace(/\s/g, '')}`}>{hotel.contact.phone}</a>
            <br />
            <a href={`mailto:${hotel.contact.email}`}>{hotel.contact.email}</a>
          </div>
          <div>
            Check-in from {hotel.checkInTime}
            <br />
            Check-out by {hotel.checkOutTime}
          </div>
        </div>
      </footer>
    </>
  );
}
