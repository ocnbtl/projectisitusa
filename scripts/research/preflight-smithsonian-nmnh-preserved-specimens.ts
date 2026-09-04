process.env.ISITUSA_PREFLIGHT_SOURCE_ID = "smithsonian-nmnh-preserved-specimens";
process.env.ISITUSA_PREFLIGHT_DATASET_URL = "https://collections.nmnh.si.edu/ipt/archive.do?r=nmnh_extant_dwc-a&v=1.112";
process.env.ISITUSA_PREFLIGHT_METADATA_URL = "https://collections.nmnh.si.edu/ipt/eml.do?r=nmnh_extant_dwc-a&v=1.112";
process.env.ISITUSA_PREFLIGHT_POLICY_URL = "https://collections.nmnh.si.edu/ipt/resource?r=nmnh_extant_dwc-a&v=1.112";
process.env.ISITUSA_PREFLIGHT_DATASET_VERSION = "1.112";
process.env.ISITUSA_PREFLIGHT_PUBLICATION_DATE = "2026-09-02";
process.env.ISITUSA_PREFLIGHT_CATALOG_SCOPE = "all";
process.env.ISITUSA_PREFLIGHT_ALLOW_STRUCTURAL_SPECIES_RANK = "1";

void import("./preflight-nybg-preserved-specimens");
