"use client";
import { useMemo, useRef, useState } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { geoAlbersUsa, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import topology from "@/data/source/county-equivalents-topology.json";
const collection = feature(topology as never, topology.objects.counties as never) as unknown as GeoJSON.FeatureCollection;
const draw = geoPath(geoAlbersUsa().fitExtent([[12,12],[948,578]], collection));
const shapes = collection.features.map(county => ({ id:String(county.id).padStart(5,"0"), path:draw(county) ?? "" }));
type View = { scale: number; x: number; y: number };
function bounded(view: View): View {
  const scale = Math.max(1, Math.min(8, view.scale));
  return { scale, x: Math.min(0, Math.max(960 * (1 - scale), view.x)), y: Math.min(0, Math.max(590 * (1 - scale), view.y)) };
}
export default function SpeciesCountyMap({ counties, selected, labels, onSelect }: {
  counties:string[]; selected:string|null; labels:Record<string,{name:string;stateCode:string}>; onSelect:(id:string)=>void;
}) {
  const recorded = useMemo(() => new Set(counties), [counties]);
  const [view, setView] = useState<View>({ scale:1, x:0, y:0 });
  const drag = useRef<{ id:number; x:number; y:number; view:View; moved:boolean } | null>(null);
  function zoom(factor:number) { setView(old => { const scale=Math.max(1,Math.min(8,old.scale*factor)); const ratio=scale/old.scale; return bounded({scale,x:480-(480-old.x)*ratio,y:295-(295-old.y)*ratio}); }); }
  return <figure className="species-county-map">
    <div className="species-map-tools"><span aria-live="polite">{Math.round(view.scale*100)}%</span><div>
      <button type="button" aria-label="Zoom in on county map" disabled={view.scale>=8} onClick={()=>zoom(1.5)}><Plus size={17} aria-hidden="true"/></button>
      <button type="button" aria-label="Zoom out of county map" disabled={view.scale<=1} onClick={()=>zoom(1/1.5)}><Minus size={17} aria-hidden="true"/></button>
      <button type="button" aria-label="Reset county map" disabled={view.scale===1} onClick={()=>setView({scale:1,x:0,y:0})}><RotateCcw size={17} aria-hidden="true"/></button>
    </div></div>
    <svg viewBox="0 0 960 590" role="img" tabIndex={0} aria-labelledby="species-map-title species-map-description"
      style={{touchAction:view.scale>1?"none":"pan-y",cursor:view.scale>1?"grab":"default"}}
      onKeyDown={event=>{if(["+","=","-","0","ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(event.key)){event.preventDefault();if(event.key==="+"||event.key==="=")zoom(1.5);else if(event.key==="-")zoom(1/1.5);else if(event.key==="0")setView({scale:1,x:0,y:0});else setView(v=>bounded({...v,x:v.x+(event.key==="ArrowLeft"?60:event.key==="ArrowRight"?-60:0),y:v.y+(event.key==="ArrowUp"?60:event.key==="ArrowDown"?-60:0)}));}}}
      onPointerDown={event=>{if(view.scale<=1)return;event.currentTarget.setPointerCapture(event.pointerId);drag.current={id:event.pointerId,x:event.clientX,y:event.clientY,view,moved:false};}}
      onPointerMove={event=>{const start=drag.current;if(!start||start.id!==event.pointerId)return;const dx=event.clientX-start.x,dy=event.clientY-start.y;start.moved ||= Math.hypot(dx,dy)>4;const ratio=960/event.currentTarget.getBoundingClientRect().width;setView(bounded({...start.view,x:start.view.x+dx*ratio,y:start.view.y+dy*ratio}));}}
      onPointerUp={event=>{const start=drag.current;drag.current=null;if(start&&!start.moved){const id=document.elementFromPoint(event.clientX,event.clientY)?.getAttribute("data-county");if(id&&recorded.has(id))onSelect(id);}if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}}
      onPointerCancel={()=>{drag.current=null;}}>
      <title id="species-map-title">Reviewed county occurrence map</title>
      <desc id="species-map-description">Highlighted counties have reviewed records. Zoom with the buttons or plus and minus keys; drag or use arrow keys to pan when zoomed. Use the recorded location selector to read source details.</desc>
      <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
      {shapes.map(county => <path key={county.id} data-county={county.id} d={county.path} vectorEffect="non-scaling-stroke"
        className={county.id===selected?"county-selected":recorded.has(county.id)?"county-recorded":"county-unknown"}
        onClick={view.scale===1&&recorded.has(county.id)?()=>onSelect(county.id):undefined}>
        <title>{labels[county.id]?.name ?? county.id}, {labels[county.id]?.stateCode}: {recorded.has(county.id)?"reviewed occurrence":"no reviewed occurrence in this snapshot"}</title>
      </path>)}</g>
    </svg>
    <figcaption><span><i aria-hidden="true" /> Reviewed occurrence</span><span className="species-map-selected-key"><i aria-hidden="true" /> Selected county</span></figcaption>
    <p className="species-map-hint">Zoom in, then drag to explore. Choose a shaded county to read its records.</p>
  </figure>;
}
