import assert from "node:assert/strict";
import test from "node:test";
import { cryptoUri, displayAmount, donationAmount, normalizeEmail, photoType, validatePreferences, validateSighting } from "../../src/lib/participation/contracts";
test("each email stream requires an explicit choice and valid scope",()=>{
 assert.throws(()=>validatePreferences({streams:[],counties:[],species:[]}));
 assert.throws(()=>validatePreferences({streams:["counties"],counties:[],species:[]}));
 assert.throws(()=>validatePreferences({streams:["species"],counties:[],species:[]}));
 assert.throws(()=>validatePreferences({streams:["unrecognized"],counties:[],species:[]}));
 assert.deepEqual(validatePreferences({streams:["facts"],counties:["stale"],species:[]}),{streams:["facts"],counties:[],species:[]});
 assert.deepEqual(validatePreferences({streams:[],counties:[],species:[]},false),{streams:[],counties:[],species:[]});
});
test("email input cannot inject headers",()=>{
 assert.equal(normalizeEmail(" Reader@Example.com "),"reader@example.com");
 assert.throws(()=>normalizeEmail("reader@example.com\r\nBcc:other@example.com"));
});
test("money uses exact cents and rejects exponent, signs, rounding, and out-of-range amounts",()=>{
 assert.equal(donationAmount("10.01"),1001);
 for(const value of ["1e3","-10","0","0.99","10000.01","10.001","Infinity"])assert.throws(()=>donationAmount(value));
 assert.equal(displayAmount("1234567890123456789",18,"eth"),"1.234567890123456789 ETH");
});
test("future or impossible observation dates and partial coordinates are rejected",()=>{
 const observation={species_label:"Not sure",county_id:"06037",observed_on:"2026-09-20",location_note:"Trail by the creek",notes:"",contact_email:"",permission:true};
 assert.equal(validateSighting(observation,"2026-09-28").contact_email,null);
 assert.throws(()=>validateSighting({...observation,observed_on:"2026-02-30"},"2026-09-28"));
 assert.throws(()=>validateSighting({...observation,observed_on:"2026-09-29"},"2026-09-28"));
 assert.throws(()=>validateSighting({...observation,latitude:"12",longitude:""},"2026-09-28"));
 assert.throws(()=>validateSighting({...observation,permission:false},"2026-09-28"));
});
test("file sniffing rejects active document formats even with misleading file names",()=>{
 assert.equal(photoType(new TextEncoder().encode('<svg onload="alert(1)"></svg>')),null);
 assert.equal(photoType(new TextEncoder().encode("<html>not a photo</html>")),null);
 assert.equal(photoType(new Uint8Array([255,216,255,0,0,0,0,0,0,0,0,0])),"image/jpeg");
});
test("wallet links require active verified addresses on the exact supported network",()=>{
 const wallet={id:"example",asset:"ETH",network:"Ethereum mainnet",address:"0x0000000000000000000000000000000000000001",verified_at:"2026-09-28T00:00:00Z",active:true};
 assert.equal(cryptoUri(wallet),"ethereum:0x0000000000000000000000000000000000000001@1");
 assert.equal(cryptoUri({...wallet,network:"Base"}),null);
 assert.equal(cryptoUri({...wallet,verified_at:""}),null);
 assert.equal(cryptoUri({...wallet,active:false}),null);
 assert.equal(cryptoUri({...wallet,address:"javascript:alert(1)"}),null);
});
