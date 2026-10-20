import type { SVGProps } from "react";

const paths = {
  route:
    "M5 17V7a3 3 0 0 1 3-3h8M12 1l4 3-4 3M8 20h8a3 3 0 0 0 3-3V7M16 23l-4-3 4-3",
  grid: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  evidence: "M12 3l8 3v6c0 5-8 9-8 9S4 17 4 12V6l8-3zM8 12l3 3 5-6",
  basket: "M3 8h18l-2 12H5L3 8zM8 8l4-6 4 6M9 12v4M15 12v4",
  arrow: "M4 12h15M13 5l7 7-7 7",
  northeast: "M5 19L19 5M5 5h14v14",
  chip: "M6 6h12v12H6zM9 9h6v6H9zM9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4",
  pin: "M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0zM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  check: "M5 12l4 4L20 5",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  reset: "M3 10a9 9 0 1 1 2 8M3 3v7h7",
  layers: "M12 2L2 7l10 5 10-5-10-5zM2 12l10 5 10-5M2 17l10 5 10-5",
  receipt: "M5 2h14v20l-4-2-3 2-3-2-4 2V2zM8 7h8M8 11h8M8 15h4",
  bolt: "M13 2L4 14h7l-1 8 10-13h-7l1-7z",
  info: "M12 8v.01M12 12v5M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  github:
    "M9 19c-5 2-5-3-7-3M16 22v-4a4 4 0 0 0-1-3c4 0 7-2 7-6a5 5 0 0 0-2-4 5 5 0 0 0 0-4s-2-1-5 2a14 14 0 0 0-6 0C6 0 4 1 4 1a5 5 0 0 0 0 4 5 5 0 0 0-2 4c0 4 3 6 7 6a4 4 0 0 0-1 3v4",
} as const;

export function Icon({
  name,
  ...props
}: SVGProps<SVGSVGElement> & { name: keyof typeof paths }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={paths[name]} />
    </svg>
  );
}

export function CircuitScene() {
  return (
    <svg
      className="circuit-scene"
      viewBox="0 0 440 210"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <pattern
          id="circuit-grid"
          width="18"
          height="18"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="1" cy="1" r=".7" fill="#354c4a" />
        </pattern>
        <linearGradient
          id="chip-fill"
          x1="165"
          y1="65"
          x2="255"
          y2="150"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#284d42" />
          <stop offset="1" stopColor="#122c26" />
        </linearGradient>
      </defs>
      <rect width="440" height="210" fill="url(#circuit-grid)" />
      <g stroke="#3b6155" strokeWidth="1.2">
        <path d="M42 58h69l35 35h31M35 150h67l32-32h43M260 93h35l32-32h71M260 118h35l32 32h66M218 38v26M218 147v32" />
        <path
          d="M38 78h60l35 27h44M38 169h73l35-38h31M261 106h51l22-22h58"
          opacity=".45"
        />
      </g>
      <path
        className="circuit-current"
        d="M42 58h69l35 35h31M260 118h35l32 32h66"
        stroke="#bcf46a"
        strokeWidth="2"
        strokeDasharray="9 130"
      />
      <g fill="#112921" stroke="#5d8264">
        <rect x="16" y="40" width="54" height="36" rx="7" />
        <rect x="16" y="132" width="54" height="36" rx="7" />
        <rect x="370" y="42" width="54" height="36" rx="7" />
        <rect x="370" y="132" width="54" height="36" rx="7" />
      </g>
      <g stroke="#a9c2ad" strokeWidth="1.5">
        <circle cx="35" cy="58" r="7" />
        <circle cx="52" cy="58" r="7" />
        <path d="M28 143h28M28 150h28M28 157h28M389 54h16M389 61h11M390 144l5 5 9-10" />
      </g>
      <g stroke="#8ead90" strokeWidth="2">
        <path d="M188 65V54M203 65V54M218 65V54M233 65V54M248 65V54M188 147v11M203 147v11M218 147v11M233 147v11M248 147v11M177 77h-11M177 92h-11M177 107h-11M177 122h-11M177 137h-11M261 77h11M261 92h11M261 107h11M261 122h11M261 137h11" />
      </g>
      <rect
        x="177"
        y="65"
        width="84"
        height="82"
        rx="10"
        fill="url(#chip-fill)"
        stroke="#6b9573"
      />
      <rect x="187" y="75" width="64" height="62" rx="6" stroke="#3e6650" />
      <path
        d="M204 119V93h15c16 0 16 19 0 19h-15M219 112l15 11"
        stroke="#c4f57b"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <g fill="#c4f57b">
        <circle cx="111" cy="58" r="3" />
        <circle cx="102" cy="150" r="3" />
        <circle cx="327" cy="150" r="3" />
      </g>
      <g fill="#a2b8a7" fontSize="8" fontFamily="monospace" letterSpacing="1.1">
        <text x="20" y="91">
          EXACT PARTS
        </text>
        <text x="17" y="184">
          PACK QUANTITY
        </text>
        <text x="366" y="93">
          ITEM TAX
        </text>
        <text x="358" y="184">
          SHIPPING
        </text>
      </g>
    </svg>
  );
}
