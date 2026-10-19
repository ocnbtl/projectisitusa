import assert from "node:assert/strict";
import { test } from "node:test";
import { validateVolunteer, suggestedVolunteerRoles } from "../../src/lib/participation/volunteers";
const valid={name:" Sample Person ",email:"SAMPLE@example.invalid",interests:["Species research"],skills:"Research and editing",motivation:"Help explain invasive plants.",availability:"Occasional help",schedule:"",consent:true};
test("intake normalizes contact details and never accepts access fields",()=>{
 const result=validateVolunteer({...valid,is_owner:true,permissions:["team"],status:"approved"});
 assert.equal(result.name,"Sample Person");assert.equal(result.email,"sample@example.invalid");
 assert.equal("permissions" in result,false);assert.equal("is_owner" in result,false);assert.equal("status" in result,false);
});
test("requires meaningful application choices and explicit review consent",()=>{
 for(const input of [{...valid,consent:false},{...valid,interests:[]},{...valid,interests:["Owner"]},{...valid,availability:"Whatever"},{...valid,skills:" "},{...valid,motivation:"x".repeat(1501)},{...valid,name:"x\u0000"},{...valid,email:"not-an-email"}])assert.throws(()=>validateVolunteer(input));
});
test("bounded duplicate interests are normalized",()=>assert.deepEqual(validateVolunteer({...valid,interests:["Outreach","Outreach"]}).interests,["Outreach"]));
test("role suggestions describe interests without inferring elevated access",()=>{
 assert.deepEqual(suggestedVolunteerRoles(["Species research","Writing and editing"]),["sightings","content"]);
 assert.deepEqual(suggestedVolunteerRoles(["Technology","Design and accessibility"]),["general"]);
 assert.deepEqual(suggestedVolunteerRoles(["Community events","Outreach"]),["events","outreach"]);
 assert.deepEqual(suggestedVolunteerRoles(["owner","finance"]),[]);
});
