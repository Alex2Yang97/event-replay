"use client";

import { useSyncExternalStore, useState } from "react";
import { Button } from "@/components/ui/button";

function subscribe() {
  return () => {};
}

function getUrl() {
  return typeof window === "undefined" ? "" : window.location.href;
}

export function ShareLink() {
  const url = useSyncExternalStore(subscribe, getUrl, () => "");
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      const input = document.getElementById(
        "share-link-input"
      ) as HTMLInputElement | null;
      input?.select();
    }
  }

  return (
    <div className="flex items-center gap-2 w-full sm:w-auto">
      <input
        id="share-link-input"
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        className="flex-1 sm:w-72 truncate bg-muted/50 border border-border/60 rounded-md px-2 py-1 text-xs text-muted-foreground font-mono"
        aria-label="Shareable replay link"
      />
      <Button type="button" size="sm" variant="outline" onClick={onCopy}>
        {copied ? "Copied!" : "Copy link"}
      </Button>
    </div>
  );
}
