// Official entry points checked 2026-10-19. Suggestions require per-record review.
export type ReportingSuggestion={name:string;url:string;source:string;scope:string};
export function reportingSuggestions(species:string|null,county:string):ReportingSuggestion[]{
 if(species==="anoplophora-glabripennis")return [{name:"USDA APHIS Asian Longhorned Beetle Program",url:"https://www.aphis.usda.gov/form/report-it",source:"https://www.aphis.usda.gov/plant-pests-diseases/alb",scope:"Asian longhorned beetle observations in the United States; check current instructions."}];
 if(["dreissena-polymorpha","dreissena-rostriformis-bugensis"].includes(species??""))return [{name:"USGS Nonindigenous Aquatic Species",url:"https://nas.er.usgs.gov/SightingReport.aspx",source:"https://nas.er.usgs.gov/SightingReport.aspx",scope:"Nonindigenous aquatic species in U.S. waters. Confirm the location and photo-sharing terms before submitting."}];
 if(species==="lycorma-delicatula"&&county.startsWith("39"))return [{name:"Ohio Department of Agriculture Plant Health",url:"https://agri.ohio.gov/divisions/plant-health/invasive-pests/invasive-insects/slf",source:"https://agri.ohio.gov/divisions/plant-health/invasive-pests/invasive-insects/slf",scope:"Spotted lanternfly in Ohio. Check current reporting guidance and follow the official Plant Pest Reporter link."}];
 return [];
}
