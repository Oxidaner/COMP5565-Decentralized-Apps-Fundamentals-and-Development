import type { CSSProperties } from "react";

const blocks = [
  { code: "01", label: "Factory" },
  { code: "02", label: "Retail" },
  { code: "03", label: "Owner" }
];
const faces = ["front", "back", "right", "left", "top", "bottom"] as const;

function blockState(index: number, stage: number | null) {
  if (stage === null) return "idle";
  if (index < stage) return "done";
  return index === stage ? "current" : "next";
}

// Decorative 3D view of the ownership chain. The loaded product's stage lights
// up the matching block; the same facts are available as text in the product card.
export default function ChainScene({ stage }: { stage: number | null }) {
  return (
    <div className={`scene ${stage === null ? "scene-idle" : ""}`} aria-hidden="true">
      <div className="scene-viewport">
        <div className="chain">
          <span className="chain-floor" />
          <span className="orbit orbit-a" />
          <span className="orbit orbit-b" />
          {blocks.map((block, index) => (
            <div className={`block block-${blockState(index, stage)}`} key={block.code} style={{ "--i": index } as CSSProperties}>
              <div className="cube">
                {faces.map((face) => (
                  <span className={`face face-${face}`} key={face}>
                    {face === "top" || face === "bottom" ? <i /> : <b>{block.code}</b>}
                  </span>
                ))}
              </div>
              <span className="block-beam" />
            </div>
          ))}
          <span className="link link-a" />
          <span className="link link-b" />
        </div>
      </div>
      <ol className="scene-legend">
        {blocks.map((block, index) => (
          <li className={`legend-${blockState(index, stage)}`} key={block.code}><b>{block.code}</b>{block.label}</li>
        ))}
      </ol>
    </div>
  );
}
