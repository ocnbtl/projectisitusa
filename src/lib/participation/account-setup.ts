import type { Permission } from "./contracts";

// Presentation only. Access is enforced by the staff record, AAL2 and RLS.
export function setupRoleDescription(account:{is_owner:boolean;permissions:Permission[]}) {
 if(account.is_owner)return "Your owner workspace includes team access, research review, communications, contributions and site activity.";
 const areas:string[]=[];
 if(account.permissions.includes("review"))areas.push(account.permissions.includes("review_decide")?"staff sighting decisions":"preliminary sighting review");
 if(account.permissions.includes("content"))areas.push("article and email drafts");
 if(account.permissions.includes("events"))areas.push("event proposals");
 if(account.permissions.includes("outreach"))areas.push("outreach and partnership proposals");
 if(account.permissions.includes("finance"))areas.push("contribution records");
 if(account.permissions.includes("audience"))areas.push("subscriber preferences");
 if(account.permissions.includes("team"))areas.push("team invitations");
 if(account.permissions.includes("analytics"))areas.push("site activity");
 if(account.permissions.includes("approve"))areas.push("staff approval of organization work");
 if(account.permissions.includes("publish"))areas.push("email approval");
 return areas.length?`Your workspace is set up for ${areas.join(", ")}. Only your assigned sections will appear.`:"Your workspace will show the sections assigned by the owner.";
}
