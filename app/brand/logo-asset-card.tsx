"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import Image from "next/image";
import { ArrowDownToLine } from "lucide-react";

const colors = [
  { id: "green", label: "Green", hex: "#00583B" },
  { id: "black", label: "Dark", hex: "#111111" },
  { id: "white", label: "White", hex: "#FFFFFF" },
] as const;

type AssetProps = {
  id: string;
  greenFile: string;
  greenPng: string;
  title: string;
  description: string;
  width: number;
  height: number;
  fullWidth?: boolean;
};

export function LogoAssetCard({ id, greenFile, greenPng, title, description, width, height, fullWidth }: AssetProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [selectedColor, setSelectedColor] = useState<(typeof colors)[number] | null>(null);
  useEffect(() => { setMounted(true); }, []);
  // Keep server/client hydration consistent, then follow the theme until a color is chosen.
  const color = selectedColor ?? colors[mounted && resolvedTheme === "dark" ? 2 : 0];
  const stem = `/brand/v10/${id}-${color.id}`;
  const svg = color.id === "green" ? greenFile : `${stem}.svg`;
  const png = color.id === "green" ? greenPng : `${stem}.png`;
  return <article className={fullWidth ? "brand-kit-full-name" : `brand-kit-card${width > height * 2 ? " brand-kit-card-wide" : ""}`} aria-labelledby={`${id}-heading`}>
    <div className="brand-kit-art" data-artwork={color.id}>
      <Image className="brand-art" src={svg} width={width} height={height} alt={`ISITUSA ${title.toLowerCase()} in ${color.label.toLowerCase()}`} unoptimized />
    </div>
    <div className="brand-kit-card-copy">
      <h3 id={`${id}-heading`}>{title}</h3>
      <p>{description}</p>
      <fieldset className="brand-kit-color-options">
        <legend>Artwork color</legend>
        {colors.map(option => <label className="brand-kit-color-choice" key={option.id}>
          <input type="radio" name={`${id}-color`} value={option.id} checked={color.id === option.id} onChange={() => setSelectedColor(option)} aria-label={`${option.label} ${title.toLowerCase()}`} />
          <span><i style={{ backgroundColor: option.hex }} aria-hidden="true" />{option.label}</span>
        </label>)}
      </fieldset>
      <div className="brand-kit-downloads">
        <a href={svg} download={`isitusa-${id}-${color.id}.svg`} aria-label={`Download ${color.label.toLowerCase()} ${title.toLowerCase()} as SVG`}><ArrowDownToLine size={17} aria-hidden="true" /> SVG</a>
        <a href={png} download={`isitusa-${id}-${color.id}.png`} aria-label={`Download ${color.label.toLowerCase()} ${title.toLowerCase()} as PNG`}><ArrowDownToLine size={17} aria-hidden="true" /> PNG</a>
      </div>
    </div>
  </article>;
}
