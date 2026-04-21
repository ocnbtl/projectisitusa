import type { CountyCoverageSpeciesSnapshot } from "@/lib/data/types";

const allAlabamaCountyFips = [
  "01001", "01003", "01005", "01007", "01009", "01011", "01013", "01015",
  "01017", "01019", "01021", "01023", "01025", "01027", "01029", "01031",
  "01033", "01035", "01037", "01039", "01041", "01043", "01045", "01047",
  "01049", "01051", "01053", "01055", "01057", "01059", "01061", "01063",
  "01065", "01067", "01069", "01071", "01073", "01075", "01077", "01079",
  "01081", "01083", "01085", "01087", "01089", "01091", "01093", "01095",
  "01097", "01099", "01101", "01103", "01105", "01107", "01109", "01111",
  "01113", "01115", "01117", "01119", "01121", "01123", "01125", "01127",
  "01129", "01131", "01133",
];

export const countyPresenceOverrides: CountyCoverageSpeciesSnapshot[] = [
  {
    speciesId: "USRIIS-L48-Animalia11899",
    countyFips: allAlabamaCountyFips,
    countyDataSources: [
      {
        source: "Outdoor Alabama",
        matchType: "manual-authoritative",
        externalId: "feral-swine-all-67-counties",
        url: "https://www.outdooralabama.com/node/1477",
      },
    ],
  },
  {
    speciesId: "USRIIS-L48-Animalia5228",
    countyFips: ["01033"],
    countyDataSources: [
      {
        source: "Alabama ANS Management Plan",
        matchType: "manual-authoritative",
        externalId: "silver-carp-colbert-county",
        url: "https://www.outdooralabama.com/sites/default/files/PDF%20documents/AL%20ANS%20Management%20Plan_FINAL_Oct%202021.pdf",
      },
    ],
  },
  {
    speciesId: "USRIIS-L48-Animalia5132",
    countyFips: ["01039"],
    countyDataSources: [
      {
        source: "Alabama ANS Management Plan",
        matchType: "manual-authoritative",
        externalId: "asiatic-clam-covington-county",
        url: "https://www.outdooralabama.com/sites/default/files/PDF%20documents/AL%20ANS%20Management%20Plan_FINAL_Oct%202021.pdf",
      },
    ],
  },
  {
    speciesId: "USRIIS-L48-Animalia5077",
    countyFips: ["01071"],
    countyDataSources: [
      {
        source: "Alabama Forestry Commission",
        matchType: "manual-authoritative",
        externalId: "emerald-ash-borer-jackson-county-2025",
        url: "https://www.forestry.alabama.gov/Pages/News/2025/Emerald_Ash.aspx",
      },
    ],
  },
  {
    speciesId: "USRIIS-L48-Plantae7779",
    countyFips: ["01081"],
    countyDataSources: [
      {
        source: "USGS NAS",
        matchType: "manual-authoritative",
        externalId: "brazilian-waterweed-lee-county",
        url: "https://nas.er.usgs.gov/queries/CollectionInfo.aspx?SpeciesID=1107",
      },
    ],
  },
  {
    speciesId: "USRIIS-L48-Plantae9354",
    countyFips: ["01081"],
    countyDataSources: [
      {
        source: "USGS NAS",
        matchType: "manual-authoritative",
        externalId: "parrot-feather-lee-county",
        url: "https://nas.er.usgs.gov/queries/CollectionInfo.aspx?HUCNumber=03130002&SpeciesID=235&State=AL",
      },
    ],
  },
  {
    speciesId: "USRIIS-L48-Animalia668",
    countyFips: ["01083"],
    countyDataSources: [
      {
        source: "USGS NAS",
        matchType: "manual-authoritative",
        externalId: "zebra-mussel-limestone-county",
        url: "https://nas.er.usgs.gov/queries/CollectionInfo.aspx?HUCNumber=06030002&SpeciesID=5&State=AL",
      },
    ],
  },
  {
    speciesId: "USRIIS-L48-Plantae8507",
    countyFips: ["01083"],
    countyDataSources: [
      {
        source: "USGS NAS",
        matchType: "manual-authoritative",
        externalId: "hydrilla-limestone-county",
        url: "https://nas.er.usgs.gov/queries/CollectionInfo.aspx?SpeciesID=2943&State=AL",
      },
    ],
  },
  {
    speciesId: "USRIIS-L48-Animalia5457",
    countyFips: ["01085"],
    countyDataSources: [
      {
        source: "USGS NAS",
        matchType: "manual-authoritative",
        externalId: "bighead-carp-lowndes-county",
        url: "https://nas.er.usgs.gov/queries/CollectionInfo.aspx?HUCNumber=31502&SpeciesID=551",
      },
    ],
  },
  {
    speciesId: "USRIIS-L48-Animalia5077",
    countyFips: ["01089"],
    countyDataSources: [
      {
        source: "Alabama Forestry Commission",
        matchType: "manual-authoritative",
        externalId: "emerald-ash-borer-madison-county-2025",
        url: "https://www.forestry.alabama.gov/Pages/News/2025/Emerald_Ash.aspx",
      },
    ],
  },
  {
    speciesId: "USRIIS-L48-Animalia668",
    countyFips: ["01089"],
    countyDataSources: [
      {
        source: "USGS NAS",
        matchType: "manual-authoritative",
        externalId: "zebra-mussel-madison-county",
        url: "https://nas.er.usgs.gov/queries/CollectionInfo.aspx?SpeciesID=5&State=AL&YearFrom=1992&YearTo=1992",
      },
    ],
  },
  {
    speciesId: "USRIIS-L48-Fungi404",
    countyFips: ["01091"],
    countyDataSources: [
      {
        source: "Alabama Forestry Commission",
        matchType: "manual-authoritative",
        externalId: "laurel-wilt-marengo-county-2012",
        url: "https://forestry.alabama.gov/Pages/Other/Forms/Annual_Reports/Annual_Report_2012.pdf",
      },
    ],
  },
  {
    speciesId: "USRIIS-L48-Animalia5204",
    countyFips: ["01099"],
    countyDataSources: [
      {
        source: "USGS NAS",
        matchType: "manual-authoritative",
        externalId: "common-carp-monroe-county",
        url: "https://nas.er.usgs.gov/Queries/SpecimenViewer.aspx?SpecimenID=609640",
      },
    ],
  },
];
