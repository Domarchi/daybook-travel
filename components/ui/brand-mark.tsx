import { cn } from "@/lib/utils";

export default function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn("daybook-mark", className)}>
      <img
        className="daybook-mark-on-dark"
        src="/brand/daybook-mark-on-dark.svg"
        alt="Daybook"
        width={96}
        height={96}
      />
      <img
        className="daybook-mark-on-light"
        src="/brand/daybook-mark-on-light.svg"
        alt=""
        aria-hidden="true"
        width={96}
        height={96}
      />
    </span>
  );
}