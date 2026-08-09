"use client";

import { useState } from "react";
import { Check, Link2, Share2 } from "lucide-react";

interface ArticleShareProps {
  url: string;
}

export function ArticleShare({ url }: ArticleShareProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(url)}`;

  return (
    <div className="storefront-article-share" aria-label="Share this guide">
      <span><Share2 size={15} /> Share</span>
      <button type="button" onClick={handleCopy} aria-label={copied ? "Link copied" : "Copy link to clipboard"}>
        {copied ? <Check size={15} /> : <Link2 size={15} />}
        {copied ? "Copied" : "Copy link"}
      </button>
      <a
        href={whatsappHref}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Share on WhatsApp"
      >
        WhatsApp
      </a>
    </div>
  );
}
