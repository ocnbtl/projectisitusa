import { geoContains } from "d3-geo";
import { feature } from "topojson-client";
import zipcodes from "zipcodes";
import countyTopology from "us-atlas/counties-10m.json";

import { countyIndex } from "@/lib/data/store";
import type { CountyRecord, ZipLookupResult } from "@/lib/data/types";

type CountyFeature = GeoJSON.Feature<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  { name?: string }
>;

const countyFeatures = (
  feature(
    countyTopology as never,
    countyTopology.objects.counties as never,
  ) as unknown as GeoJSON.FeatureCollection<
    GeoJSON.Polygon | GeoJSON.MultiPolygon,
    { name?: string }
  >
).features as CountyFeature[];

function findCountyByPoint(longitude: number, latitude: number) {
  return countyFeatures.find((county) =>
    geoContains(county, [longitude, latitude]),
  );
}

function toLookupResult(
  zip: string,
  city: string,
  state: string,
  county: CountyRecord,
  longitude: number,
  latitude: number,
): ZipLookupResult {
  return {
    zip,
    city,
    state,
    countyFips: county.countyFips,
    countyName: `${county.name}, ${county.stateCode}`,
    neighborFips: county.neighborFips,
    coordinates: {
      latitude,
      longitude,
    },
  };
}

export function lookupZipToCounty(zip: string) {
  const lookup = zipcodes.lookup(zip);
  if (!lookup) {
    return null;
  }

  const countyFeature = findCountyByPoint(lookup.longitude, lookup.latitude);
  if (!countyFeature) {
    return null;
  }

  const county = countyIndex[countyFeature.id as string];
  if (!county) {
    return null;
  }

  const result = toLookupResult(
    lookup.zip,
    lookup.city,
    lookup.state,
    county,
    lookup.longitude,
    lookup.latitude,
  );

  return result;
}
