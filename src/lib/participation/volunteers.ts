// Kept dependency-free so the same intake validation runs in the browser and Edge runtime.
function boundedText(value:unknown,label:string,max:number,required=true){
 if(typeof value!=="string")throw new Error(`Enter ${label}.`);
 const text=value.trim();if((required&&!text)||text.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text))throw new Error(`Check ${label} (up to ${max} characters).`);return text;
}
function normalizeEmail(value:unknown){const email=boundedText(value,"your email",254).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error("Enter a valid email address.");return email;}

export const VOLUNTEER_INTERESTS = ["Species research", "Writing and editing", "Community events", "Outreach", "Design and accessibility", "Technology", "Something else"] as const;
export const VOLUNTEER_ROLES = [
  { id: "sightings", name: "Sighting volunteer", permission: "review", detail: "Compare observations with species references and leave preliminary reviews. Final decisions stay with staff." },
  { id: "content", name: "Content volunteer", permission: "content", detail: "Research species, improve explanations, and prepare content for review. No mailing-list or publishing access." },
  { id: "events", name: "Events volunteer", permission: "events", detail: "Prepare event ideas and work on assigned events, with staff approval." },
  { id: "outreach", name: "Outreach volunteer", permission: "outreach", detail: "Develop community and partnership proposals for staff review." },
  { id: "general", name: "General volunteer", permission: null, detail: "Start in the team room to plan design, technology, or other work. Additional access is granted only when needed." },
] as const;
export const AVAILABILITY = ["Occasional help", "1–2 hours a week", "3–5 hours a week", "6–10 hours a week", "More than 10 hours a week", "Let’s discuss"] as const;
export const APPLICATION_STATES = { submitted: "New", in_review: "In review", approved: "Ready to invite", declined: "Not moving forward", inviting: "Invitation in progress", invited: "Joined / invited" } as const;
export type VolunteerRole = typeof VOLUNTEER_ROLES[number]["id"];
export type ApplicationStatus = keyof typeof APPLICATION_STATES;
export type VolunteerApplication = {
  id:string; name:string; email:string; interests:string[]; skills:string; motivation:string; availability:string; schedule:string;
  status:ApplicationStatus; role_id:VolunteerRole|null; review_note:string; version:number; created_at:string; updated_at:string; invited_user_id:string|null;
};
export function validateVolunteer(input:Record<string,unknown>) {
  if (input.consent !== true) throw new Error("Please confirm that our team may review your application and contact you about volunteering.");
  const interests = input.interests;
  if (!Array.isArray(interests) || !interests.length || interests.length > VOLUNTEER_INTERESTS.length || interests.some(v => !VOLUNTEER_INTERESTS.includes(v))) throw new Error("Choose at least one area you’re interested in.");
  if (!AVAILABILITY.some(v=>v===input.availability)) throw new Error("Choose your availability.");
  return {
    name:boundedText(input.name,"your name",100), email:normalizeEmail(input.email), interests:[...new Set(interests)] as string[],
    skills:boundedText(input.skills,"your skills and experience",2000), motivation:boundedText(input.motivation,"what you’d like to help with",1500),
    availability:String(input.availability), schedule:boundedText(input.schedule??"","your schedule",500,false), consent_version:"volunteer-2026-10-19",
  };
}
export function suggestedVolunteerRoles(interests:string[]):VolunteerRole[] {
  const roles:VolunteerRole[]=[];
  if(interests.includes("Species research"))roles.push("sightings","content");
  if(interests.includes("Writing and editing"))roles.push("content");
  if(interests.includes("Community events"))roles.push("events");
  if(interests.includes("Outreach"))roles.push("outreach");
  if(interests.some(v=>["Design and accessibility","Technology","Something else"].includes(v)))roles.push("general");
  return [...new Set(roles)];
}
