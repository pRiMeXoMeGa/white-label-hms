import { ArchArt, sceneFor } from '../components/Art';
import { SearchForm, defaultSearch, searchQuery } from '../components/SearchForm';
import { money } from '../lib/format';
import { rememberedStay, useHotel } from '../lib/hotel';
import { Link, useTitle } from '../lib/router';

export function Home() {
  const hotel = useHotel();
  useTitle('', hotel.brand.name);
  const query = searchQuery(defaultSearch(hotel.today));
  const stay = rememberedStay();

  return (
    <>
      <section className="hero">
        <div className="container">
          <div className="hero-copy">
            <h1>{hotel.brand.name}</h1>
            <p className="hero-lede">{hotel.brand.tagline}</p>
            <SearchForm />
          </div>
          <div className="hero-art">
            <ArchArt scene="hero" label="Illustration of the sun setting over the sea, framed by an arch" />
          </div>
        </div>
      </section>

      <section className="section container">
        <div className="journey panel-flat">
          <div>
            <h2 className="journey-title">Your whole stay, from your phone</h2>
            <p className="muted">No app to install and no account to create. Your booking reference is all you need.</p>
          </div>
          <ol className="journey-steps">
            <li>
              <strong>Book</strong>
              <span>Pick dates and a room, guarantee with a card.</span>
            </li>
            <li>
              <strong>Check in online</strong>
              <span>Add your ID details and get your room number and Stay ID.</span>
            </li>
            <li>
              <strong>Order to your room</strong>
              <span>Dining, laundry, spa, airport cars, all added to one bill.</span>
            </li>
            <li>
              <strong>Check out in a tap</strong>
              <span>Review the itemised bill, pay and download the invoice.</span>
            </li>
          </ol>
          <div className="row">
            <Link className="btn" href="/check-in">
              Check in online
            </Link>
            <Link className="btn btn-ghost" href={stay ? `/stay/${stay}` : '/stay'}>
              Open my stay
            </Link>
          </div>
        </div>
      </section>

      <section className="section container" aria-labelledby="rooms-title">
        <div className="section-head">
          <h2 id="rooms-title">Rooms and suites</h2>
          <Link href={`/rooms?${query}`}>See prices for your dates</Link>
        </div>
        <div className="rooms">
          {hotel.roomTypes.map((rt, i) => (
            <article className="room-card" key={rt.slug}>
              <ArchArt scene={sceneFor(rt.slug, i)} label={`${rt.name}, ${rt.view}`} />
              <div className="room-card-body">
                <h3>{rt.name}</h3>
                <p className="room-facts">
                  {rt.sizeSqm} m², {rt.bed}, {rt.view.toLowerCase()}
                </p>
                <p className="small">{rt.description}</p>
                <div className="room-card-foot">
                  <span className="price-from">
                    <span className="muted small">From, per night</span>
                    <span className="price">{money(rt.baseRateMinor, { whole: true })}</span>
                  </span>
                  <Link className="btn btn-ghost" href={`/rooms?${query}`}>
                    Book
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
        <p className="small muted" style={{ marginTop: '1rem' }}>
          {hotel.taxesNote}
        </p>
      </section>

      <section className="section container">
        <ul className="highlights">
          {hotel.highlights.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      </section>
    </>
  );
}
