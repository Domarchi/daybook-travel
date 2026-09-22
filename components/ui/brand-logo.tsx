import { cn } from "@/lib/utils";

export default function BrandLogo({ className }: { className?: string }) {
  return (
    <span className={cn("daybook-logo", className)}>
      <img
        className="daybook-logo-on-dark"
        src="/brand/daybook-travel-logo-on-dark.svg"
        alt="Daybook Travel"
        width={328}
        height={96}
      />
      <img
        className="daybook-logo-on-light"
        src="/brand/daybook-travel-logo-on-light.svg"
        alt=""
        aria-hidden="true"
        width={328}
        height={96}
      />
    </span>
  );
}
