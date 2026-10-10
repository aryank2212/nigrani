import { useId } from "react";

// Flat illustrations standing in for citizen / officer photos in the demo.
// The "before" and "after" scenes of the same type share the same fixtures (wall, tree, pole...),
// so the before/after comparison makes visual sense. Real uploads render as <img> instead.

const Smoke = ({ x, y, n = 7, s = 1, o = 0.5, c = "#4b4a47", dx = 14, dy = -22 }) => (
  <g>
    {Array.from({ length: n }, (_, i) => (
      <circle key={i} cx={x + i * dx * s + (i % 2 ? 4 : -3)} cy={y + i * dy * s} r={(9 + i * 5) * s} fill={c} opacity={o * (1 - i / (n + 1))} />
    ))}
  </g>
);

const Flame = ({ x, y, s = 1 }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <path d="M0 0 C-10 -12 -6 -26 0 -40 C4 -26 12 -18 8 -6 C6 -2 2 0 0 0Z" fill="#e8821a" />
    <path d="M0 0 C-5 -8 -3 -16 0 -24 C3 -16 6 -10 4 -4Z" fill="#f5c242" />
  </g>
);

const Dust = ({ cx, cy, n = 6, s = 1, o = 0.55 }) => (
  <g fill="#cdbf9d">
    {Array.from({ length: n }, (_, i) => (
      <circle key={i} cx={cx + ((i * 37) % 90) - 40} cy={cy - ((i * 23) % 50)} r={(14 + ((i * 11) % 18)) * s} opacity={o * (1 - i / (n + 2))} />
    ))}
  </g>
);

function Fixtures({ type }) {
  switch (type) {
    case "construction_dust":
      return (
        <g>
          <rect x="20" y="95" width="10" height="110" fill="#8d877a" />
          <rect x="130" y="95" width="10" height="110" fill="#8d877a" />
          <rect x="240" y="95" width="10" height="110" fill="#8d877a" />
          <rect x="14" y="92" width="240" height="9" fill="#a39d8f" />
          <rect x="14" y="140" width="240" height="7" fill="#a39d8f" />
          <path d="M310 205 V50 H370 M310 50 L290 28 M310 80 H370" stroke="#6a655a" strokeWidth="5" fill="none" />
          <rect x="0" y="185" width="400" height="20" fill="#9a9486" />
        </g>
      );
    case "industrial_smoke":
      return (
        <g>
          <rect x="60" y="120" width="190" height="85" fill="#8f8a7e" />
          <rect x="85" y="60" width="22" height="62" fill="#78736a" />
          <rect x="150" y="75" width="22" height="47" fill="#78736a" />
          <rect x="270" y="140" width="55" height="65" fill="#a7a193" />
          <rect x="75" y="140" width="170" height="8" fill="#6f6a60" opacity="0.5" />
        </g>
      );
    case "road_dust":
      return (
        <g>
          <path d="M120 205 L180 120 H230 L330 205Z" fill="#6f6b63" />
          <path d="M205 205 L205 120" stroke="#e3dfd3" strokeWidth="3" strokeDasharray="10 8" />
          <circle cx="50" cy="120" r="26" fill="#5f6b4f" /><rect x="47" y="130" width="6" height="75" fill="#5b4a38" />
          <circle cx="355" cy="130" r="22" fill="#5f6b4f" /><rect x="352" y="140" width="6" height="65" fill="#5b4a38" />
        </g>
      );
    case "debris":
      return (
        <g>
          <rect x="0" y="120" width="400" height="85" fill="#aaa497" />
          <rect x="0" y="195" width="400" height="10" fill="#8b857a" />
          <rect x="330" y="60" width="8" height="140" fill="#5b5448" /><rect x="318" y="70" width="32" height="5" fill="#5b5448" />
        </g>
      );
    default: // waste_burning
      return (
        <g>
          <rect x="0" y="120" width="400" height="85" fill="#a59f90" />
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <rect key={i} x={i * 52} y="150" width="50" height="2" fill="#8e887a" />)}
          <circle cx="60" cy="105" r="36" fill="#5f6b4f" /><rect x="56" y="125" width="8" height="80" fill="#5b4a38" />
          <rect x="335" y="55" width="6" height="150" fill="#5b5448" /><circle cx="338" cy="55" r="7" fill="#d8d2c0" />
        </g>
      );
  }
}

function Active({ type, k = 1 }) {
  switch (type) {
    case "construction_dust":
      return (<g><Dust cx={130} cy={150} s={k} n={8} /><Dust cx={250} cy={170} s={k * 0.8} n={5} /></g>);
    case "industrial_smoke":
      return (<g><Smoke x={96} y={58} s={k * 1.1} o={0.6} c="#35332f" dx={12} dy={-18} /><Smoke x={161} y={73} s={k} o={0.55} c="#35332f" dx={12} dy={-18} /></g>);
    case "road_dust":
      return (<g><Dust cx={200} cy={170} s={k * 1.2} n={8} /><Dust cx={270} cy={185} s={k} n={5} /></g>);
    case "debris":
      return (
        <g>
          <polygon points="60,200 100,150 150,160 190,200" fill="#8a7f6e" /><polygon points="130,200 180,140 240,155 280,200" fill="#9b9078" />
          <polygon points="215,200 250,165 300,175 330,200" fill="#7c7262" />
          <Dust cx={170} cy={150} s={k * 0.7} n={5} o={0.4} />
        </g>
      );
    default:
      return (
        <g>
          <ellipse cx="190" cy="198" rx={70 * k} ry={16 * k} fill="#2f2a24" />
          <path d={`M${120 + (1 - k) * 40} 198 Q190 ${140 + (1 - k) * 40} ${260 - (1 - k) * 40} 198Z`} fill="#3b342c" />
          <Flame x={165} y={172} s={1.2 * k} /><Flame x={195} y={168} s={1.5 * k} /><Flame x={225} y={174} s={1.1 * k} />
          <Smoke x={200} y={140} n={9} s={1.1 * k} o={0.55} dx={16} dy={-20} />
        </g>
      );
  }
}

function Clean({ type }) {
  switch (type) {
    case "construction_dust":
      return (
        <g>
          <rect x="14" y="100" width="240" height="95" fill="#4f7a64" opacity="0.8" />
          {[40, 80, 120, 160, 200].map((x) => <path key={x} d={`M${x} 205 q8 -22 16 0`} stroke="#9fc7e6" strokeWidth="2" fill="none" />)}
        </g>
      );
    case "industrial_smoke":
      return <path d="M85 60 q4 -14 8 -6 M150 75 q4 -12 8 -5" stroke="#d9d4c5" strokeWidth="2" fill="none" opacity="0.7" />;
    case "road_dust":
      return (<g>{[170, 210, 250].map((x) => <path key={x} d={`M${x} 190 q8 -18 16 0`} stroke="#9fc7e6" strokeWidth="2" fill="none" />)}</g>);
    case "debris":
      return <rect x="0" y="198" width="400" height="7" fill="#9a9486" />;
    default:
      return <ellipse cx="190" cy="198" rx="62" ry="12" fill="#4a443b" opacity="0.35" />;
  }
}

function Elsewhere() {
  return (
    <g>
      <rect x="0" y="0" width="400" height="300" fill="#bcd3dd" />
      <rect x="0" y="195" width="400" height="105" fill="#7d9468" />
      <rect x="40" y="95" width="130" height="100" fill="#b86a50" /><rect x="40" y="82" width="130" height="14" fill="#8e4b38" />
      {[60, 100, 140].map((x) => <rect key={x} x={x} y="120" width="18" height="22" fill="#e9eef0" />)}
      <rect x="250" y="130" width="90" height="6" fill="#4f5b63" /><rect x="254" y="136" width="5" height="60" fill="#4f5b63" /><rect x="331" y="136" width="5" height="60" fill="#4f5b63" />
      <circle cx="370" cy="110" r="26" fill="#4e7a4a" />
      <ellipse cx="220" cy="215" rx="90" ry="9" fill="#6a7f59" />
    </g>
  );
}

const ALT = {
  active: "Photo showing the problem",
  still: "After photo: the problem is still visible",
  clean: "After photo: the site is clear",
  wrong: "After photo: a different place",
  old: "Old photo from an earlier date",
  dup: "Photo copied from another report",
};

export default function Scene({ type = "waste_burning", state = "active", className = "" }) {
  const fid = useId().replace(/\W/g, "");
  const aged = state === "old" || state === "dup";
  const base = state === "wrong" ? null : state === "still" ? "active" : state === "clean" ? "clean" : "active";
  return (
    <svg className={`scene ${className}`} viewBox="0 0 400 300" role="img" aria-label={`${ALT[state]} (illustration)`} preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={`${fid}sky`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#bdb8aa" /><stop offset="1" stopColor="#e6e1d4" /></linearGradient>
        <filter id={`${fid}age`}>
          <feColorMatrix type="matrix" values="0.45 0.45 0.1 0 0  0.4 0.4 0.1 0 0  0.25 0.3 0.1 0 0  0 0 0 1 0" />
          <feTurbulence baseFrequency="0.9" numOctaves="2" result="n" />
          <feColorMatrix in="n" type="saturate" values="0" />
          <feBlend in2="SourceGraphic" mode="multiply" />
        </filter>
      </defs>
      <g filter={aged ? `url(#${fid}age)` : undefined}>
        {state === "wrong" ? <Elsewhere /> : (
          <>
            <rect width="400" height="300" fill={`url(#${fid}sky)`} />
            <circle cx="320" cy="48" r="26" fill="#f3e9c9" opacity="0.7" />
            <rect y="200" width="400" height="100" fill="#7d776b" />
            <Fixtures type={type} />
            {base === "active" && <Active type={type} k={state === "still" ? 0.55 : 1} />}
            {base === "clean" && <Clean type={type} />}
          </>
        )}
      </g>
      {aged && (
        <text x="10" y="290" fontSize="13" fill="#f3e9c9" fontFamily="monospace" opacity="0.9">
          {state === "old" ? "IMG_0417 · 12 Oct 2023" : "found online · stock"}
        </text>
      )}
    </svg>
  );
}
