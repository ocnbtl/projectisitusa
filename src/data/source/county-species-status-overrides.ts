import type { CountySpeciesStatusOverride } from "@/lib/data/types";

/**
 * Manual non-presence determinations for the county-species matrix.
 *
 * Verified presence is generated from county presence imports and manual
 * authoritative presence overrides. Use this file only when a reputable source
 * supports a non-presence status for a specific county and species.
 */
export const countySpeciesStatusOverrides: CountySpeciesStatusOverride[] = [
  {
    countyFips: "01071",
    speciesId: "hypophthalmichthys-molitrix",
    status: "not-detected",
    evidenceScope: "survey-area",
    source: {
      label: "USFWS invasive carp eDNA sample layer",
      url: "https://services.arcgis.com/QVENGdaPbd4LUkLV/arcgis/rest/services/USFWS_Great_Lakes_Region_3_Bighead_and_Silver_Carp_eDNA_Data_Feature_Layer_View/FeatureServer/0",
    },
    notes:
      "USFWS eDNA samples in Jackson County Tennessee River waterbodies reported No eDNA detected. This is survey-area non-detection evidence, not countywide absence.",
    reviewedAt: "2026-04-25",
  },
  {
    countyFips: "01079",
    speciesId: "hypophthalmichthys-molitrix",
    status: "not-detected",
    evidenceScope: "survey-area",
    source: {
      label: "USFWS invasive carp eDNA sample layer",
      url: "https://services.arcgis.com/QVENGdaPbd4LUkLV/arcgis/rest/services/USFWS_Great_Lakes_Region_3_Bighead_and_Silver_Carp_eDNA_Data_Feature_Layer_View/FeatureServer/0",
    },
    notes:
      "USFWS eDNA samples in Lawrence County Tennessee River waterbodies reported No eDNA detected. This is survey-area non-detection evidence, not countywide absence.",
    reviewedAt: "2026-04-25",
  },
  {
    countyFips: "01079",
    speciesId: "hypophthalmichthys-nobilis",
    status: "not-detected",
    evidenceScope: "survey-area",
    source: {
      label: "USFWS invasive carp eDNA sample layer",
      url: "https://services.arcgis.com/QVENGdaPbd4LUkLV/arcgis/rest/services/USFWS_Great_Lakes_Region_3_Bighead_and_Silver_Carp_eDNA_Data_Feature_Layer_View/FeatureServer/0",
    },
    notes:
      "USFWS eDNA samples in Lawrence County Tennessee River waterbodies reported No eDNA detected. This is survey-area non-detection evidence, not countywide absence.",
    reviewedAt: "2026-04-25",
  },
  {
    countyFips: "01083",
    speciesId: "hypophthalmichthys-molitrix",
    status: "not-detected",
    evidenceScope: "survey-area",
    source: {
      label: "USFWS invasive carp eDNA sample layer",
      url: "https://services.arcgis.com/QVENGdaPbd4LUkLV/arcgis/rest/services/USFWS_Great_Lakes_Region_3_Bighead_and_Silver_Carp_eDNA_Data_Feature_Layer_View/FeatureServer/0",
    },
    notes:
      "USFWS eDNA samples in Limestone County Elk River waterbodies reported No eDNA detected. This is survey-area non-detection evidence, not countywide absence.",
    reviewedAt: "2026-04-25",
  },
  {
    countyFips: "01083",
    speciesId: "hypophthalmichthys-nobilis",
    status: "not-detected",
    evidenceScope: "survey-area",
    source: {
      label: "USFWS invasive carp eDNA sample layer",
      url: "https://services.arcgis.com/QVENGdaPbd4LUkLV/arcgis/rest/services/USFWS_Great_Lakes_Region_3_Bighead_and_Silver_Carp_eDNA_Data_Feature_Layer_View/FeatureServer/0",
    },
    notes:
      "USFWS eDNA samples in Limestone County Elk River waterbodies reported No eDNA detected. This is survey-area non-detection evidence, not countywide absence.",
    reviewedAt: "2026-04-25",
  },
  {
    countyFips: "01103",
    speciesId: "hypophthalmichthys-nobilis",
    status: "not-detected",
    evidenceScope: "survey-area",
    source: {
      label: "USFWS invasive carp eDNA sample layer",
      url: "https://services.arcgis.com/QVENGdaPbd4LUkLV/arcgis/rest/services/USFWS_Great_Lakes_Region_3_Bighead_and_Silver_Carp_eDNA_Data_Feature_Layer_View/FeatureServer/0",
    },
    notes:
      "USFWS eDNA samples in Morgan County Wheeler National Wildlife Refuge and Tennessee River waterbodies reported No eDNA detected. This is survey-area non-detection evidence, not countywide absence.",
    reviewedAt: "2026-04-25",
  },
  {
    countyFips: "01025",
    speciesId: "varroa-destructor",
    status: "not-detected",
    evidenceScope: "survey-area",
    source: {
      label: "APHIS National Honey Bee Survey public data",
      url: "https://www.usbeedata.org/state_reports/public_download/",
    },
    notes:
      "APHIS National Honey Bee Survey public rows for Clarke County Alabama reported 0 Varroa mites per 100 bees in sampled honey bee colonies, with no conflicting positive Clarke County Varroa row in the reviewed public file. This is sample-level non-detection evidence, not countywide absence.",
    reviewedAt: "2026-06-14",
  },
  {
    countyFips: "01119",
    speciesId: "varroa-destructor",
    status: "not-detected",
    evidenceScope: "survey-area",
    source: {
      label: "APHIS National Honey Bee Survey public data",
      url: "https://www.usbeedata.org/state_reports/public_download/",
    },
    notes:
      "APHIS National Honey Bee Survey public rows for Sumter County Alabama reported 0 Varroa mites per 100 bees in sampled honey bee colonies, with no conflicting positive Sumter County Varroa row in the reviewed public file. This is sample-level non-detection evidence, not countywide absence.",
    reviewedAt: "2026-06-14",
  },
];
