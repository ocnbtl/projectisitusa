import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { feature } from 'topojson-client';
import { geoAlbersUsa, geoMercator, geoPath } from 'd3-geo';
const read = p => JSON.parse(readFileSync(new URL('../'+p, import.meta.url), 'utf8'));
const topology = read('src/data/source/county-equivalents-topology.json');
const registry = read('src/data/research/county-equivalent-registry.json');
const configured = new Set(read('src/data/research/state-research-config.json').states.map(s=>s.stateCode));
const expected = registry.countyEquivalents.filter(c=>configured.has(c.stateCode)).map(c=>c.countyFips).sort();
const counties = feature(topology,topology.objects.counties).features.filter(c=>Number(String(c.id).slice(0,2))<60);
assert.equal(new Set(counties.map(c=>String(c.id))).size,3144);
assert.deepEqual(counties.map(c=>String(c.id)).sort(),expected);
assert.equal(counties.filter(c=>String(c.id).startsWith('02')).length,30);
assert.equal(counties.filter(c=>String(c.id).startsWith('15')).length,5);
assert.equal(counties.filter(c=>String(c.id).startsWith('09')).length,9);
assert.ok(!counties.some(c=>String(c.id)==='02261'));
for(const [region,prefix,rotation] of [['AK','02',154],['HI','15',157]]) {
  const features=counties.filter(c=>String(c.id).startsWith(prefix));
  const projection=geoMercator().rotate([rotation,0]).fitExtent([[14,190],[376,600]],{type:'FeatureCollection',features});
  const path=geoPath(projection);
  for(const county of features) {assert.ok(path(county)?.length>0,region+' visible '+county.id); assert.ok(path.centroid(county).every(Number.isFinite));}
}
const nationalPath=geoPath(geoAlbersUsa().scale(1000));
for(const id of ['02020','15003','11001','09110','01001'])assert.ok(nationalPath(counties.find(c=>String(c.id)===id))?.length>0,id);
console.log('PASS: exact 3144 configured county geometries, 30 AK, 5 HI, 9 current CT, antimeridian region projections and representative national paths.');
