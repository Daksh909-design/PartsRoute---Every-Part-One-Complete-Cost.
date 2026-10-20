import type { SVGProps } from "react";
const paths = {
  route:
    "M5 17V7a3 3 0 0 1 3-3h8M12 1l4 3-4 3M8 20h8a3 3 0 0 0 3-3V7M16 23l-4-3 4-3",
  arrow: "M4 12h15M13 5l7 7-7 7",
  northeast: "M5 19L19 5M5 5h14v14",
  info: "M12 8v.01M12 12v5M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
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
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={paths[name]} />
    </svg>
  );
}
