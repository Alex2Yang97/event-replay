import Link from "next/link";
import { DEMOS, demoHref } from "@/lib/demos";

type Props = {
  heading?: string;
};

export function DemoStrip({ heading = "Try a sample replay" }: Props) {
  return (
    <section className="space-y-3">
      <h2 className="text-xs uppercase tracking-wide text-muted-foreground">
        {heading}
      </h2>
      <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
        {DEMOS.map((d) => (
          <li key={`${d.ticker}-${d.timestamp}`}>
            <Link
              href={demoHref(d)}
              className="block rounded-md border border-border/60 bg-background px-3 py-2 hover:bg-muted/50 transition-colors"
            >
              <div className="text-sm font-medium">{d.label}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {d.note}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
