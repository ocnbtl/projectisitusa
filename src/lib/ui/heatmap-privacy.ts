// Exact point shape emitted by pinned PostHog JS1.438.7. Unknown shapes fail closed.
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const anonymousId = /^(?:\$device:)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const types = new Set(["click", "mousemove"]);
export type CaptureEvent = {event:string; properties:Record<string,unknown>; timestamp?:unknown; uuid?:unknown};
export function cleanHeatmap(event:CaptureEvent, path:string, token:string):CaptureEvent|null {
  if (event.event!=="$$heatmap" || !["/about","/brand","/approach"].includes(path)) return null;
  const data=event.properties.$heatmap_data;
  if (!data || typeof data!=="object" || Array.isArray(data) || Object.keys(data).length!==1) return null;
  const canonical="https://isitusa.com"+path;
  const points:{x:number;y:number;type:string;target_fixed:boolean}[]=[];
  for (const [url, batch] of Object.entries(data)) {
    // Never merge points from a previous route or a sensitive URL into this page.
    if (url!==canonical || !Array.isArray(batch) || batch.length>500) continue;
    for (const point of batch) {
      if (!point || typeof point!=="object" || Array.isArray(point) || Object.keys(point).sort().join(",")!=="target_fixed,type,x,y") continue;
      const {x,y,type,target_fixed}=point;
      if (typeof x!=="number" || typeof y!=="number" || !Number.isFinite(x) || !Number.isFinite(y) || x<0 || y<0 || x>100000 || y>100000 || !types.has(type) || typeof target_fixed!=="boolean") continue;
      points.push({x:Math.round(x),y:Math.round(y),type,target_fixed});
    }
  }
  if (!points.length || points.length>500) return null;
  const properties:Record<string,unknown>={token,$heatmap_data:{[canonical]:points},$current_url:canonical,$geoip_disable:true,$ip:"0.0.0.0",$process_person_profile:false,$is_identified:false};
  for(const key of ["distinct_id","$session_id","$window_id"]){const value=event.properties[key];if(typeof value==="string" && (key==="distinct_id"?anonymousId:uuid).test(value))properties[key]=value;}
  const clean:CaptureEvent={event:"$$heatmap",properties};
  if(typeof event.uuid==="string" && uuid.test(event.uuid))clean.uuid=event.uuid;
  if(typeof event.timestamp==="string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(event.timestamp))clean.timestamp=event.timestamp;
  return clean;
}
