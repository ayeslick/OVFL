"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { segmentWeights, type CapsuleSegment } from "@/lib/capsule-segments";
import { getReducedMotion } from "./motion";
import "./surfaces.css";

function boundaryPath(y: number, amp: number): string {
  if (y <= 0) return "M0 0H400V600H0Z";
  if (y >= 600) return "M0 600H400V600H0Z";
  return `M0 ${y} C100 ${y + amp},100 ${y + amp},200 ${y} C300 ${y - amp},300 ${y - amp},400 ${y} L400 600 H0Z`;
}

function interpolate(from: number[], to: number[], t: number): number[] {
  return to.map((value, index) => {
    const start = from[index] ?? value;
    return start + (value - start) * t;
  });
}

export function Capsule({
  segments,
  compact = false,
  draft = false,
  className,
}: {
  segments: readonly CapsuleSegment[];
  compact?: boolean;
  draft?: boolean;
  className?: string;
}) {
  const reactId = useId().replaceAll(":", "");
  const clipId = `clip-${reactId}`;
  const gradientId = `blue-${reactId}`;
  const target = useMemo(() => segmentWeights(segments), [segments]);
  const labels = useMemo(() => segments.map((row) => row.label).join("|"), [segments]);
  const [weights, setWeights] = useState(target);
  const previousRef = useRef<{ labels: string; weights: number[] }>({ labels, weights: target });

  useEffect(() => {
    const previous = previousRef.current;
    const sameLabels = previous.labels === labels && previous.weights.length === target.length;
    previousRef.current = { labels, weights: target };
    if (!sameLabels || getReducedMotion()) {
      setWeights(target);
      return;
    }
    const start = previous.weights;
    const origin = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - origin) / 550);
      setWeights(interpolate(start, [...target], 1 - (1 - t) ** 3));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [labels, target]);

  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const activeCount = weights.filter((w) => w > 0).length;
  const aria = segments.map((row) => `${row.label}: ${row.text}`).join("; ");

  let cursor = 0;
  const paths: { d: string; fill: string; key: string }[] = [];
  const labelsUi: {
    top: string;
    light: boolean;
    small: boolean;
    text: string;
    label: string;
    key: string;
  }[] = [];

  if (activeCount === 0) {
    paths.push({ d: "M0 0H400V600H0Z", fill: "var(--pale)", key: "empty" });
  } else {
    segments.forEach((segment, index) => {
      const part = (weights[index] ?? 0) / sum;
      const start = cursor;
      cursor += part;
      if (part < 0.00001) return;
      const next = weights[index + 1] ? (weights[index + 1] ?? 0) / sum : part;
      const amp = Math.min(35, part * 600 * 0.25, next * 600 * 0.25);
      const fill = segment.color === "var(--loan)" ? `url(#${gradientId})` : segment.color;
      paths.push({ d: boundaryPath(start * 600, amp), fill, key: `${segment.label}-${index}` });
      const tiny = part < 0.12 && activeCount > 1;
      if (!compact && !tiny) {
        labelsUi.push({
          top: `${(start + part / 2) * 100}%`,
          light: Boolean(segment.light),
          small: part < 0.22 && activeCount > 1,
          text: segment.text,
          label: segment.label,
          key: `${segment.label}-label-${index}`,
        });
      }
    });
  }

  return (
    <div
      className={["kit-capsule", className].filter(Boolean).join(" ")}
      data-compact={compact ? "true" : undefined}
      data-draft={draft ? "true" : undefined}
      role="img"
      aria-label={aria || "No amount yet"}
    >
      <svg viewBox="0 0 400 600" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <clipPath id={clipId}>
            <rect width="400" height="600" rx="110" />
          </clipPath>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--primary)" />
            <stop offset="1" stopColor="var(--primary-hover)" />
          </linearGradient>
        </defs>
        <g clipPath={`url(#${clipId})`}>
          {paths.map((path) => (
            <path key={path.key} d={path.d} fill={path.fill} />
          ))}
        </g>
      </svg>
      <div className="kit-capsule-labels">
        {activeCount === 0 ? (
          <div className="kit-capsule-value" style={{ top: "50%" }}>
            <strong>0</strong>
            <span>No amount yet</span>
          </div>
        ) : (
          labelsUi.map((row) => (
            <div
              key={row.key}
              className="kit-capsule-value"
              data-light={row.light ? "true" : undefined}
              data-small={row.small ? "true" : undefined}
              style={{ top: row.top }}
            >
              <strong>{row.text}</strong>
              <span>{row.label}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function CapsuleLegend({
  segments,
}: {
  segments: readonly CapsuleSegment[];
}) {
  return (
    <div className="kit-capsule-legend">
      {segments
        .filter((row) => row.amountWei > 0n)
        .map((row) => (
          <span key={row.label} className="kit-legend-item">
            <span className="kit-legend-swatch" style={{ ["--swatch" as string]: row.color }} aria-hidden="true" />
            {row.label} {row.text}
          </span>
        ))}
    </div>
  );
}
