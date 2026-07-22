"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

const MemberForm = dynamic(() => import("./MemberForm"), { ssr: false });

export default function LazyMemberForm() {
  const boundary = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = boundary.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={boundary} className="min-h-72">
      {visible ? <MemberForm /> : <p className="text-sm text-white/75">Membership form loads as you reach this section.</p>}
    </div>
  );
}
