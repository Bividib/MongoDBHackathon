import type { DemoPhase } from "./cockpit-data";

type Series = {
  id: string;
  label: string;
  color: string;
  dashed: boolean;
  emphasis: boolean;
  endY: number;
  values: ReadonlyArray<number>;
};

const days = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;

function buildSeries(phase: DemoPhase): ReadonlyArray<Series> {
  const harbourLanded = phase === "bank";
  const startCash = 8400;
  const harbourCash = startCash + 1200;

  const doNothing = harbourLanded
    ? [harbourCash, harbourCash, harbourCash, 7200, -4000]
    : [startCash, startCash, startCash, 6000, -5200];

  const delaySupplier = harbourLanded
    ? [harbourCash, harbourCash, harbourCash, harbourCash, -1600]
    : [startCash, startCash, startCash, startCash, -2800];

  const northstarPays = harbourLanded
    ? [harbourCash, harbourCash, harbourCash, harbourCash, 3200]
    : [startCash, startCash, 9600, 9600, 3200];

  return [
    {
      id: "do_nothing",
      label: "If we do nothing",
      color: "#ef6a4a",
      dashed: false,
      emphasis: phase !== "bank",
      endY: doNothing[doNothing.length - 1],
      values: doNothing
    },
    {
      id: "delay_supplier",
      label: "If we delay Supplier X",
      color: "#f5a623",
      dashed: true,
      emphasis: false,
      endY: delaySupplier[delaySupplier.length - 1],
      values: delaySupplier
    },
    {
      id: "northstar_pays",
      label: "If Northstar pays too",
      color: "#34d399",
      dashed: true,
      emphasis: phase === "bank",
      endY: northstarPays[northstarPays.length - 1],
      values: northstarPays
    }
  ];
}

const yMin = -10000;
const yMax = 15000;
const yTicks = [15000, 10000, 5000, 0, -5000, -10000];

const padding = { top: 28, right: 150, bottom: 30, left: 52 };
const width = 780;
const height = 240;
const innerWidth = width - padding.left - padding.right;
const innerHeight = height - padding.top - padding.bottom;

function scaleX(index: number): number {
  return padding.left + (index / (days.length - 1)) * innerWidth;
}

function scaleY(value: number): number {
  const t = (value - yMin) / (yMax - yMin);
  return padding.top + (1 - t) * innerHeight;
}

function buildSmoothPath(values: ReadonlyArray<number>): string {
  const points = values.map((v, i) => ({ x: scaleX(i), y: scaleY(v) }));

  if (points.length === 0) return "";

  let d = `M ${points[0].x} ${points[0].y}`;

  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const tension = 0.18;
    const c1x = p1.x + (p2.x - p0.x) * tension;
    const c1y = p1.y + (p2.y - p0.y) * tension;
    const c2x = p2.x - (p3.x - p1.x) * tension;
    const c2y = p2.y - (p3.y - p1.y) * tension;

    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }

  return d;
}

function formatTickLabel(value: number): string {
  if (value === 0) return "£0";
  const sign = value < 0 ? "-" : "";
  return `${sign}£${Math.abs(value) / 1000}k`;
}

export function CashRunwayChart({ phase }: { phase: DemoPhase }) {
  const series = buildSeries(phase);
  const fridayX = scaleX(days.length - 1);
  const zeroY = scaleY(0);

  return (
    <div className="relative w-full">
      <svg
        aria-label="Cash runway forecast"
        className="block h-auto w-full"
        role="img"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="dangerFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(239, 106, 74, 0.0)" />
            <stop offset="100%" stopColor="rgba(239, 106, 74, 0.18)" />
          </linearGradient>
          <linearGradient id="payrollLine" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(245, 166, 35, 0.4)" />
            <stop offset="100%" stopColor="rgba(245, 166, 35, 0.05)" />
          </linearGradient>
        </defs>

        {/* Danger zone fill below £0 */}
        <rect
          x={padding.left}
          y={zeroY}
          width={innerWidth}
          height={padding.top + innerHeight - zeroY}
          fill="url(#dangerFill)"
        />

        {/* Y axis grid + labels */}
        {yTicks.map((tick) => {
          const y = scaleY(tick);
          return (
            <g key={tick}>
              <line
                x1={padding.left}
                x2={padding.left + innerWidth}
                y1={y}
                y2={y}
                stroke={tick === 0 ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.06)"}
                strokeDasharray={tick === 0 ? "0" : "2 4"}
              />
              <text
                x={padding.left - 12}
                y={y}
                fill="#6b6b73"
                fontSize="11"
                fontWeight="500"
                textAnchor="end"
                dominantBaseline="middle"
              >
                {formatTickLabel(tick)}
              </text>
            </g>
          );
        })}

        {/* X axis labels */}
        {days.map((day, i) => (
          <text
            key={day}
            x={scaleX(i)}
            y={padding.top + innerHeight + 22}
            fill="#9b9ba1"
            fontSize="11"
            fontWeight="500"
            textAnchor="middle"
          >
            {day}
          </text>
        ))}

        {/* Friday vertical guideline */}
        <line
          x1={fridayX}
          x2={fridayX}
          y1={padding.top}
          y2={padding.top + innerHeight}
          stroke="rgba(245,166,35,0.5)"
          strokeDasharray="3 4"
          strokeWidth="1"
        />

        {/* Friday "PAYROLL FRIDAY" badge */}
        <g transform={`translate(${fridayX - 56}, ${padding.top - 24})`}>
          <rect
            width="112"
            height="22"
            rx="6"
            fill="rgba(245,166,35,0.12)"
            stroke="rgba(245,166,35,0.45)"
          />
          <text
            x="56"
            y="14"
            fill="#ffb547"
            fontSize="10"
            fontWeight="700"
            letterSpacing="1.4"
            textAnchor="middle"
          >
            PAYROLL FRIDAY
          </text>
        </g>

        {/* Series paths */}
        {series.map((s) => {
          const d = buildSmoothPath(s.values);
          const opacity = s.emphasis ? 1 : 0.85;
          return (
            <g key={s.id}>
              <path
                d={d}
                fill="none"
                stroke={s.color}
                strokeWidth={s.emphasis ? 2.5 : 2}
                strokeDasharray={s.dashed ? "5 5" : "0"}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={opacity}
              />
              <circle
                cx={fridayX}
                cy={scaleY(s.endY)}
                r="4.5"
                fill="#0a0a0c"
                stroke={s.color}
                strokeWidth="2"
              />
            </g>
          );
        })}

        {/* Series labels at right edge */}
        {series.map((s) => (
          <text
            key={`${s.id}-label`}
            x={fridayX + 12}
            y={scaleY(s.endY)}
            fill={s.color}
            fontSize="11"
            fontWeight="600"
            dominantBaseline="middle"
          >
            {s.label}
          </text>
        ))}
      </svg>
    </div>
  );
}
