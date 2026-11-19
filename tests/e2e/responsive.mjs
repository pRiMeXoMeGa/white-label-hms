// Loads every main page at 8 screen sizes (320 px phone to 1920 px desktop) and fails if any
// page scrolls sideways or has controls shorter than 32 px. Start the app first, then: npm run e2e:responsive
import { chromium } from 'playwright';
const BASE = process.env.BASE ?? 'http://localhost:3000';
const sizes = [[320,640,'small phone'],[375,667,'iPhone SE'],[390,844,'iPhone 14'],[430,932,'large phone'],[768,1024,'tablet portrait'],[1024,768,'tablet landscape'],[1366,768,'laptop'],[1920,1080,'desktop']];
const api = async (p, body) => (await fetch(BASE + '/api' + p, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined)).json();
const { today } = await api('/health');
const out = new Date(Date.parse(today) + 2 * 864e5).toISOString().slice(0, 10);
const r = await api('/reservations', { roomTypeSlug: 'one-bedroom-suite', checkIn: today, checkOut: out, adults: 2, guest: { firstName: 'Aisha', lastName: 'Khan', email: 'a@example.com', phone: '+971500000000' }, card: { holder: 'A K', number: '4242424242424242', expiry: '12/29' } });
const s = await api('/check-in', { code: r.code, lastName: 'Khan', nationality: 'India', idType: 'passport', idNumber: 'Z1234567', acceptTerms: true });
await api(`/stays/${s.stayCode}/orders/food`, { items: [{ itemId: 3, quantity: 2 }] });
const pages = ['/', `/rooms?checkIn=${today}&checkOut=${out}&adults=2&children=0`, `/book/deluxe-king?checkIn=${today}&checkOut=${out}&adults=2&children=0`, '/manage', '/check-in',
  `/stay/${s.stayCode}`, `/stay/${s.stayCode}/dining`, `/stay/${s.stayCode}/spa`, `/stay/${s.stayCode}/transfer`, `/stay/${s.stayCode}/info`, `/stay/${s.stayCode}/bill`, `/stay/${s.stayCode}/checkout`];
const browser = await chromium.launch();
const problems = [];
for (const [w, h, name] of sizes) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  for (const p of pages) {
    await page.goto(BASE + p); await page.waitForLoadState('networkidle'); await page.waitForTimeout(300);
    const res = await page.evaluate(() => {
      const doc = document.documentElement;
      const overflow = doc.scrollWidth - doc.clientWidth;
      const offenders = [];
      if (overflow > 0) for (const el of document.querySelectorAll('body *')) { const b = el.getBoundingClientRect(); if (b.right > doc.clientWidth + 1 && b.width > 0) offenders.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')} right=${Math.round(b.right)}`); }
      const small = [...document.querySelectorAll('button, a.btn, input, select')].filter(e => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && b.height < 32 && !e.classList.contains('btn-link') && e.type !== 'checkbox' && e.type !== 'radio'; }).map(e => e.textContent.trim().slice(0,20) || e.tagName);
      return { overflow, offenders: offenders.slice(0, 4), small: small.slice(0, 4) };
    });
    if (res.overflow > 0 || res.small.length) problems.push({ size: `${w}x${h} ${name}`, page: p.replace(s.stayCode, ':id').split('?')[0], ...res });
  }
  await page.close();
}
console.log(JSON.stringify({ checked: sizes.length * pages.length, problems }, null, 1));
if (problems.length) process.exitCode = 1;
await browser.close();
