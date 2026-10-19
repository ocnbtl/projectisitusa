import {test} from "node:test";
import assert from "node:assert/strict";
import {reportingSuggestions} from "../../src/lib/participation/report-routing";
test("unknown and unresolved taxa require a curated destination",()=>{assert.deepEqual(reportingSuggestions(null,"39061"),[]);assert.deepEqual(reportingSuggestions("unknown","39061"),[]);});
test("Ohio lanternfly route does not bleed across state boundaries",()=>{assert.equal(reportingSuggestions("lycorma-delicatula","39061").length,1);assert.equal(reportingSuggestions("lycorma-delicatula","42003").length,0);});
test("aquatic and ALB programs are species-specific",()=>{assert.match(reportingSuggestions("dreissena-polymorpha","39061")[0].url,/nas.er.usgs.gov/);assert.match(reportingSuggestions("anoplophora-glabripennis","25027")[0].url,/aphis.usda.gov/);assert.equal(reportingSuggestions("medicago-polymorpha","39061").length,0);});
