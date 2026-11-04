"use client";
import { useId, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { SpeciesImage } from "./species-image";
type ProfilePhoto = { src: string; alt: string; credit: string; sourceUrl?: string; license?: string };
/** Additional verified photographs can be passed here without changing profile layout. */
export function ProfileGallery({ images, label }: { images: ProfilePhoto[]; label: string }) {
  const photos = useMemo(() => images.filter((photo, index, all) => photo.src && all.findIndex(item => item.src === photo.src) === index), [images]);
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const id = useId();
  const active = Math.min(index, photos.length - 1);
  if (!photos.length) return null;
  function move(delta: number) { setDirection(delta); setIndex(value => (value + delta + photos.length) % photos.length); }
  return <div className="profile-gallery" role="region" aria-label={label + " photographs"} aria-roledescription={photos.length > 1 ? "carousel" : undefined}>
    <div id={id} className="profile-gallery-window"><div key={photos[active].src} className="profile-gallery-slide" data-direction={direction}><SpeciesImage {...photos[active]} label={label}/></div></div>
    {photos.length > 1 && <div className="profile-gallery-controls">
      <button type="button" aria-label="Previous photograph" aria-controls={id} onClick={() => move(-1)}><ChevronLeft size={19} aria-hidden="true"/></button>
      <span role="status" aria-live="polite">Photo {active + 1} of {photos.length}</span>
      <button type="button" aria-label="Next photograph" aria-controls={id} onClick={() => move(1)}><ChevronRight size={19} aria-hidden="true"/></button>
    </div>}
  </div>;
}
