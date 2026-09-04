process.env.ISITUSA_PREFLIGHT_SOURCE_ID = "harvard-huh-usa-preserved-specimens";
process.env.ISITUSA_PREFLIGHT_DATASET_URL = "https://ipt.huh.harvard.edu/ipt/archive.do?r=huh_usa&v=1.74";
process.env.ISITUSA_PREFLIGHT_METADATA_URL = "https://ipt.huh.harvard.edu/ipt/eml.do?r=huh_usa&v=1.74";
process.env.ISITUSA_PREFLIGHT_POLICY_URL = "https://ipt.huh.harvard.edu/ipt/resource.do?r=huh_usa&v=1.74";
process.env.ISITUSA_PREFLIGHT_DATASET_VERSION = "1.74";
process.env.ISITUSA_PREFLIGHT_PUBLICATION_DATE = "2026-08-29";
process.env.ISITUSA_PREFLIGHT_CATALOG_SCOPE = "plants";
process.env.ISITUSA_PREFLIGHT_ALLOW_STRUCTURAL_SPECIES_RANK = "1";
process.env.ISITUSA_PREFLIGHT_LICENSE_TOKEN = "http://creativecommons.org/licenses/by/4.0/legalcode";
process.env.ISITUSA_PREFLIGHT_RIGHTS_DESCRIPTION = "The versioned archive EML licenses the complete occurrence dataset under CC BY 4.0; retained records and derivatives require Harvard University Herbaria attribution.";

void import("./preflight-nybg-preserved-specimens");
