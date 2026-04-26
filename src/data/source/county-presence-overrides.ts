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
    speciesId: "USRIIS-L48-Bacteria470",
    countyFips: ["01003", "01097"],
    countyDataSources: [
      {
        source: "Alabama Department of Agriculture and Industries",
        matchType: "manual-authoritative",
        externalId: "citrus-canker-baldwin-county-2022",
        url: "https://agi.alabama.gov/2022/02/citrus-canker-quarantine-established-in-baldwin-county-alabama/",
      },
      {
        source: "USDA APHIS",
        matchType: "manual-authoritative",
        externalId: "citrus-canker-xanthomonas-citri-synonym",
        url: "https://www.aphis.usda.gov/plant-pests-diseases/citrus-diseases/citrus-canker",
      },
      {
        source: "Alabama Department of Agriculture and Industries",
        matchType: "manual-authoritative",
        externalId: "citrus-canker-mobile-county-2025",
        url: "https://agi.alabama.gov/plantprotection/2025/11/citrus-canker-detected-in-mobile-county/",
      },
    ],
  },
  {
    speciesId: "USRIIS-L48-Plantae6937",
    countyFips: ["01003"],
    countyDataSources: [
      {
        source: "SERNEC",
        matchType: "manual-authoritative",
        externalId: "casuarina-equisetifolia-baldwin-ncu-00096327",
        url: "https://sernecportal.org/portal/collections/individual/index.php?occid=14386315",
      },
      {
        source: "SERNEC",
        matchType: "manual-authoritative",
        externalId: "casuarina-equisetifolia-baldwin-ncu-00096326",
        url: "https://sernecportal.org/portal/collections/individual/index.php?occid=14386322",
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
    speciesId: "USRIIS-L48-Animalia5077",
    countyFips: ["01055", "01117"],
    countyDataSources: [
      {
        source: "Alabama Forestry Commission",
        matchType: "manual-authoritative",
        externalId: "emerald-ash-borer-etowah-shelby-counties-2025",
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
  {
    speciesId: "USRIIS-L48-Plantae11688",
    countyFips: ["01101"],
    countyDataSources: [
      {
        source: "USGS NAS",
        matchType: "manual-authoritative",
        externalId: "narrow-leaved-cattail-montgomery-county",
        url: "https://nas.er.usgs.gov/queries/collectioninfo.aspx?SpeciesID=2679",
      },
    ],
  },
  {
    speciesId: "USRIIS-L48-Plantae9160",
    countyFips: ["01101", "01109"],
    countyDataSources: [
      {
        source: "USGS NAS",
        matchType: "manual-authoritative",
        externalId: "small-water-clover-montgomery-pike-counties",
        url: "https://nas.er.usgs.gov/queries/collectioninfo.aspx?SpeciesID=292",
      },
    ],
  },
  {
    speciesId: "USRIIS-L48-Animalia5228",
    countyFips: ["01103"],
    countyDataSources: [
      {
        source: "USGS NAS",
        matchType: "manual-authoritative",
        externalId: "silver-carp-morgan-county",
        url: "https://nas.er.usgs.gov/queries/CollectionInfo.aspx?SpeciesID=549",
      },
    ],
  },
  {
    speciesId: "USRIIS-L48-Fungi404",
    countyFips: ["01105"],
    countyDataSources: [
      {
        source: "Alabama Forestry Commission",
        matchType: "manual-authoritative",
        externalId: "laurel-wilt-perry-county-2017",
        url: "https://forestry.alabama.gov/Pages/Other/Forms/Annual_Reports/Annual_Report_2017.pdf",
      },
    ],
  },
  {
    speciesId: "USRIIS-L48-Plantae6293",
    countyFips: ["01107"],
    countyDataSources: [
      {
        source: "USGS NAS",
        matchType: "manual-authoritative",
        externalId: "alligatorweed-pickens-county",
        url: "https://nas.er.usgs.gov/queries/CollectionInfo.aspx?HUCNumber=31601&SpeciesID=227",
      },
    ],
  },
  {
    speciesId: "USRIIS-L48-Plantae9354",
    countyFips: ["01111"],
    countyDataSources: [
      {
        source: "USGS NAS",
        matchType: "manual-authoritative",
        externalId: "parrot-feather-randolph-county",
        url: "https://nas.er.usgs.gov/queries/CollectionInfo.aspx?HUCNumber=03130002&SpeciesID=235&State=AL",
      },
    ],
  },
  {
    speciesId: "USRIIS-L48-Plantae7788",
    countyFips: ["01113"],
    countyDataSources: [
      {
        source: "USGS NAS",
        matchType: "manual-authoritative",
        externalId: "water-hyacinth-russell-county",
        url: "https://nas.er.usgs.gov/queries/CollectionInfo.aspx?HUCNumber=03130003&SpeciesID=1130&State=AL",
      },
    ],
  },
  {
    speciesId: "USRIIS-L48-Plantae9360",
    countyFips: ["01115"],
    countyDataSources: [
      {
        source: "USGS NAS",
        matchType: "manual-authoritative",
        externalId: "brittle-waternymph-st-clair-county",
        url: "https://nas.er.usgs.gov/queries/collectioninfo.aspx?SpeciesID=1118",
      },
    ],
  },
  {
    speciesId: "USRIIS-L48-Plantae8507",
    countyFips: ["01117"],
    countyDataSources: [
      {
        source: "USGS NAS",
        matchType: "manual-authoritative",
        externalId: "hydrilla-shelby-county",
        url: "https://nas.er.usgs.gov/queries/SpecimenViewer.aspx?SpecimenID=229420",
      },
    ],
  },
  {
    speciesId: "USRIIS-L48-Animalia5132",
    countyFips: ["01119"],
    countyDataSources: [
      {
        source: "USGS NAS",
        matchType: "manual-authoritative",
        externalId: "freshwater-golden-clam-sumter-county",
        url: "https://nas.er.usgs.gov/queries/CollectionInfo.aspx?HUCNumber=3160202&SpeciesID=92&fmb=0&pathway=0&status=0",
      },
    ],
  },
  {
    speciesId: "USRIIS-L48-Animalia5077",
    countyFips: ["01121"],
    countyDataSources: [
      {
        source: "Alabama Forestry Commission",
        matchType: "manual-authoritative",
        externalId: "emerald-ash-borer-talladega-county-2025",
        url: "https://www.forestry.alabama.gov/Pages/News/2025/Emerald_Ash.aspx",
      },
    ],
  },
  {
    speciesId: "USRIIS-L48-Animalia668",
    countyFips: ["01125"],
    countyDataSources: [
      {
        source: "USGS NAS",
        matchType: "manual-authoritative",
        externalId: "zebra-mussel-tuscaloosa-county",
        url: "https://nas.er.usgs.gov/queries/CollectionInfo.aspx?HUCNumber=03160112&SpeciesID=5&State=AL",
      },
    ],
  },
  {
    speciesId: "USRIIS-L48-Plantae7246",
    countyFips: ["01131"],
    countyDataSources: [
      {
        source: "USGS NAS",
        matchType: "manual-authoritative",
        externalId: "wild-taro-wilcox-county",
        url: "https://nas.er.usgs.gov/queries/SpecimenViewer.aspx?SpecimenID=230460",
      },
    ],
  },
  {
    speciesId: "USRIIS-L48-Plantae8585",
    countyFips: ["01133"],
    countyDataSources: [
      {
        source: "Alabama Forestry Commission",
        matchType: "manual-authoritative",
        externalId: "cogongrass-winston-county-2020",
        url: "https://www.forestry.alabama.gov/Pages/Informational/Treasured_Forests/Magazine/2020_Spring.pdf",
      },
    ],
  },
];
