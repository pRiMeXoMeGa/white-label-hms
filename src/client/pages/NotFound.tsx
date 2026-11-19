import { useHotel } from '../lib/hotel';
import { Link, useTitle } from '../lib/router';

export function NotFound() {
  const hotel = useHotel();
  useTitle('Page not found', hotel.brand.name);
  return (
    <div className="container page stack">
      <h1 style={{ fontSize: 'var(--step-3)' }}>This page does not exist</h1>
      <p>The link may be old or mistyped.</p>
      <div className="row">
        <Link className="btn" href="/">
          Go to the home page
        </Link>
        <Link className="btn btn-ghost" href="/stay">
          Open my stay
        </Link>
      </div>
    </div>
  );
}
