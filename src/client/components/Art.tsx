// Illustrations drawn in code from the brand colours, so a re-branded hotel gets matching art
// without new image assets. Each room type gets a scene that matches its view.

type Scene = 'marina' | 'twin' | 'sea' | 'terrace' | 'hero';

const SCENES: Record<string, Scene> = {
  'deluxe-king': 'marina',
  'deluxe-twin': 'twin',
  'sea-view-premier': 'sea',
  'one-bedroom-suite': 'terrace',
};

export function sceneFor(slug: string, index = 0): Scene {
  return SCENES[slug] ?? (['marina', 'sea', 'twin', 'terrace'] as const)[index % 4]!;
}

const fill = (c: string) => ({ fill: c });

export function ArchArt({ scene, label, className = 'arch' }: { scene: Scene; label: string; className?: string }) {
  const id = `g-${scene}`;
  const skyTop = scene === 'twin' ? 'color-mix(in srgb, var(--brand) 55%, #0b1b2a)' : 'color-mix(in srgb, var(--accent) 30%, #fdf6e8)';
  const skyBottom = scene === 'twin' ? 'color-mix(in srgb, var(--accent) 45%, var(--brand))' : 'color-mix(in srgb, var(--accent) 70%, #fbe7c4)';
  const sun = scene === 'twin' ? { cx: 290, cy: 120, r: 26 } : scene === 'hero' ? { cx: 200, cy: 250, r: 70 } : { cx: 260, cy: 215, r: 48 };

  return (
    <div className={className} role="img" aria-label={label}>
      <svg viewBox="0 0 400 440" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: skyTop }} />
            <stop offset="1" style={{ stopColor: skyBottom }} />
          </linearGradient>
        </defs>
        <rect width="400" height="440" fill={`url(#${id})`} />
        <circle {...sun} style={fill(scene === 'twin' ? '#fdf3df' : 'var(--accent)')} />

        {(scene === 'marina' || scene === 'twin') && (
          <g style={fill('color-mix(in srgb, var(--brand) 78%, black)')}>
            <rect x="18" y="170" width="34" height="150" />
            <rect x="58" y="120" width="28" height="200" />
            <path d="M92 320V95l16-20 16 20v225z" />
            <rect x="132" y="190" width="40" height="130" />
            <rect x="300" y="150" width="30" height="170" />
            <rect x="336" y="205" width="46" height="115" />
            {scene === 'twin' &&
              [70, 110, 150, 310, 350].map((x) => <rect key={x} x={x - 6} y={230} width="4" height="6" style={fill('#fdf3df')} opacity="0.7" />)}
          </g>
        )}

        {scene === 'sea' && (
          <g fill="none" style={{ stroke: 'color-mix(in srgb, var(--brand) 85%, black)' }} strokeWidth="6">
            <circle cx="96" cy="250" r="62" />
            {Array.from({ length: 8 }, (_, i) => {
              const a = (i * Math.PI) / 4;
              return <line key={i} x1="96" y1="250" x2={96 + 62 * Math.cos(a)} y2={250 + 62 * Math.sin(a)} strokeWidth="2.5" />;
            })}
            <line x1="96" y1="250" x2="70" y2="320" />
            <line x1="96" y1="250" x2="122" y2="320" />
          </g>
        )}

        {/* the sea */}
        <rect y="318" width="400" height="122" style={fill('var(--brand)')} />
        <g style={{ stroke: 'color-mix(in srgb, var(--accent) 60%, white)' }} strokeWidth="3" strokeLinecap="round" opacity="0.75">
          <line x1="200" y1="336" x2="320" y2="336" />
          <line x1="230" y1="354" x2="300" y2="354" />
          <line x1="60" y1="372" x2="120" y2="372" />
          <line x1="250" y1="390" x2="280" y2="390" />
        </g>

        {scene === 'sea' && (
          <g style={{ stroke: 'color-mix(in srgb, var(--ink) 85%, black)' }} strokeWidth="5">
            <line x1="0" y1="392" x2="400" y2="392" />
            {[20, 70, 120, 170, 220, 270, 320, 370].map((x) => (
              <line key={x} x1={x} y1="392" x2={x} y2="440" strokeWidth="4" />
            ))}
          </g>
        )}

        {(scene === 'terrace' || scene === 'hero') && (
          <g style={fill('color-mix(in srgb, var(--ink) 88%, black)')}>
            <path d="M318 440c4-70 10-130 22-190l10 2c-10 60-14 120-16 188z" />
            <path d="M344 250c-30-22-70-24-104-8 34-4 68 2 100 18zM346 248c10-36 36-62 70-70-26 18-46 42-58 74zM344 252c36-8 70 4 96 30-32-16-62-22-94-18zM342 250c-20-30-24-64-14-96 4 34 12 64 26 92zM344 250c-34 6-62 28-78 58 22-24 50-42 80-50z" />
          </g>
        )}
        {scene === 'terrace' && <rect x="0" y="410" width="400" height="30" style={fill('color-mix(in srgb, var(--accent) 40%, #e9dcc4)')} />}
      </svg>
    </div>
  );
}
