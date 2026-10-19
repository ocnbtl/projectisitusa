import assert from "node:assert/strict";
import { cryptoUri } from "../src/lib/participation/contracts";
import { SUPPORT_DESTINATIONS } from "../src/content/support-destinations";
const schemes:Record<string,string>={BTC:"bitcoin:",ETH:"ethereum:",SOL:"solana:",XRP:"xrpl://",XMR:"monero:"};
for(const wallet of SUPPORT_DESTINATIONS.wallets){
 const uri=cryptoUri(wallet);assert.ok(uri?.startsWith(schemes[wallet.asset]));assert.ok(uri.includes(wallet.address));
 assert.equal(cryptoUri({...wallet,active:false}),null);
 assert.equal(cryptoUri({...wallet,verified_at:null}),null);
 assert.equal(cryptoUri({...wallet,network:"testnet"}),null);
 assert.equal(cryptoUri({...wallet,address:"invalid?destination=other"}),null);
 if(wallet.asset==="SOL"||wallet.asset==="XRP")assert.ok(!uri.includes("amount="));
 if(wallet.asset==="XRP")assert.equal(new URL(uri).searchParams.get("network"),"XRPL");
}
console.log("Five verified wallet links and invalid/inactive/network guards passed.");
