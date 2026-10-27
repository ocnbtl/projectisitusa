"use client";
import { useMemo } from "react";
import { geoAlbersUsa, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import topology from "@/data/source/county-equivalents-topology.json";

const collection = feature(topology as never, topology.objects.counties as never) as unknown as GeoJSON.FeatureCollection;
const draw = geoPath(geoAlbersUsa().fitExtent([[12,12],[948,578]], collection));
const shapes = collection.features.map(county => ({ id:String(county.id).padStart(5,"0"), path:draw(county) ?? "" }));
export default function SpeciesCountyMap({ counties, selected, labels, onSelect }: {
  counties:string[]; selected:string|null; labels:Record<string,{name:string;stateCode:string}>; onSelect:(id:string)=>void;
}) {
  const recorded = useMemo(() => new Set(counties), [counties]);
  return <figure className="species-county-map">
    <svg viewBox="0 0 960 590" role="img" aria-labelledby="species-map-title species-map-description">
      <title id="species-map-title">Reviewed county occurrence map</title>
      <desc id="species-map-description">Highlighted counties have reviewed records. Unshaded counties do not establish absence. Use the recorded location selector for accessible source details.</desc>
      {shapes.map(county => <path key={county.id} d={county.path}
        className={county.id===selected?"county-selected":recorded.has(county.id)?"county-recorded":"county-unknown"}
        onClick={recorded.has(county.id)?()=>onSelect(county.id):undefined}>
        <title>{labels[county.id]?.name ?? county.id}, {labels[county.id]?.stateCode}: {recorded.has(county.id)?"reviewed occurrence":"no reviewed occurrence in this snapshot"}</title>
      </path>)}
    </svg>
    <figcaption><span><i aria-hidden="true" /> Reviewed occurrence</span><span className="species-map-selected-key"><i aria-hidden="true" /> Selected county</span><span>Unshaded does not mean absent. Records may be historical.</span></figcaption>
  </figure>;
}
