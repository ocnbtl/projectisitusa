import type { CountyDetail } from "@/lib/data/types";

export const countyDetailSeed: CountyDetail[] = [
  {
    countyFips: "01001",
    evidenceLevel: "statewide-only",
    auditSummary:
      "Autauga County has been reviewed against current Alabama statewide and county extension sources, but no county-specific invasive inventory or detection notice strong enough for production use has been verified yet.",
    headline: "Autauga County still leans statewide",
    countySummary:
      "Autauga County currently relies on statewide and federal invasive-species coverage in the live explorer. The county audit confirmed local extension capacity and public agricultural reporting, but it did not surface a county-specific invasive species list or formal detection notice that would justify a county-level data change.",
    summaryParagraphs: [
      "Autauga County is still leaning on statewide and federal invasive-species records in the live explorer. The local extension footprint is real, but the county audit did not turn up a county-specific species list or formal detection notice strong enough to change what we show on the map yet.",
      "That means the county view is useful for awareness, but it should still be read as a broad signal rather than a finished local inventory.",
    ],
    lastReviewedOn: "2026-04-20",
    resources: [
      {
        label: "Autauga County Extension Office",
        url: "https://www.aces.edu/counties/autauga/",
        kind: "county-extension",
      },
      {
        label: "Autauga County Annual Report",
        url: "https://www.aces.edu/blog/topics/autauga/autauga-county-annual-report/",
        kind: "county-program",
      },
      {
        label: "Alabama Forestry Commission Invasive Species",
        url: "https://forestry.alabama.gov/Pages/Fire/Invasive_Species.aspx",
        kind: "statewide-program",
      },
    ],
  },
  {
    countyFips: "01003",
    evidenceLevel: "county-specific",
    auditSummary:
      "Baldwin County has a verified county-specific official plant-health record through the Alabama citrus canker quarantine notice, which is stronger than the evidence available for most Alabama counties reviewed so far.",
    headline: "Baldwin County: citrus canker changed things",
    countySummary:
      "Baldwin County is one of the clearest Alabama counties in the current audit because an official citrus canker quarantine notice confirms a county-specific invasive plant disease event. That is still narrower than a full county invasive inventory, but it is strong enough to anchor a more local public-facing summary and resource list.",
    summaryParagraphs: [
      "Baldwin County has one of the strongest county-specific public records in Alabama so far. The citrus canker quarantine notice gives the county a concrete local invasive-plant signal instead of leaving it entirely dependent on statewide context.",
      "It is still not the same thing as a full county invasive inventory, but it gives residents a much clearer reason to pay attention to plant health and local reporting.",
    ],
    lastReviewedOn: "2026-04-20",
    resources: [
      {
        label: "Baldwin County Extension Office",
        url: "https://www.aces.edu/counties/baldwin/",
        kind: "county-extension",
      },
      {
        label: "Citrus Canker Quarantine Notice",
        url: "https://agi.alabama.gov/2022/02/citrus-canker-quarantine-established-in-baldwin-county-alabama/",
        kind: "regulatory-notice",
      },
      {
        label: "Alabama Forestry Commission Invasive Species",
        url: "https://forestry.alabama.gov/Pages/Fire/Invasive_Species.aspx",
        kind: "statewide-program",
      },
    ],
  },
  {
    countyFips: "01005",
    evidenceLevel: "county-specific",
    auditSummary:
      "Barbour County has a verified county-specific official detection signal through the Alabama Africanized honeybee notice, which currently makes it one of the strongest local wildlife-related public records in the Alabama audit.",
    headline: "Barbour County: honeybee risks got local",
    countySummary:
      "Barbour County stands out in the current Alabama audit because the Alabama Department of Agriculture and Industries publicly confirmed an Africanized honeybee detection tied to the county. That single official notice does not create a complete county wildlife inventory, but it does provide a concrete county-level occurrence signal that can support public county detail.",
    summaryParagraphs: [
      "Barbour County stands out because the state publicly confirmed an Africanized honeybee detection tied to the county. That gives the county a real local wildlife signal instead of leaving everything at the statewide level.",
      "It is still one official notice, not a full wildlife inventory, but it is enough to make the county detail feel grounded and worth sharing.",
    ],
    lastReviewedOn: "2026-04-20",
    resources: [
      {
        label: "Barbour County Extension Office",
        url: "https://www.aces.edu/counties/barbour/",
        kind: "county-extension",
      },
      {
        label: "Africanized Honeybee Detection Notice",
        url: "https://agi.alabama.gov/plantprotection/2025/06/africanized-honeybees-detected-in-alabama-2/",
        kind: "county-detection",
      },
      {
        label: "Barbour County Annual Report PDF",
        url: "https://www.aces.edu/wp-content/uploads/2023/07/ACES-2734_BarbourCountyAnnualReport2022_062223L.pdf",
        kind: "county-program",
      },
    ],
  },
  {
    countyFips: "01007",
    evidenceLevel: "statewide-only",
    auditSummary:
      "Bibb County has a verified extension presence and statewide invasive program coverage, but the reviewed public sources did not expose a county-specific invasive list or detection notice that met the production bar.",
    headline: "Bibb County still needs local proof",
    countySummary:
      "Bibb County currently remains a statewide-source county in the audit. The public source stack shows local extension infrastructure, but it does not yet provide a county-specific invasive record set strong enough to revise the county-level display in Project Isitusa.",
    summaryParagraphs: [
      "Bibb County has local extension coverage, but the public sources reviewed so far still stop short of a county-specific invasive list or detection record that would change the live county view.",
      "For now, this is a county where the map is still strongest as a statewide-backed warning sign, not a finished local report card.",
    ],
    lastReviewedOn: "2026-04-20",
    resources: [
      {
        label: "Bibb County Extension Office",
        url: "https://www.aces.edu/counties/bibb",
        kind: "county-extension",
      },
      {
        label: "Alabama Forestry Commission Invasive Species",
        url: "https://forestry.alabama.gov/Pages/Fire/Invasive_Species.aspx",
        kind: "statewide-program",
      },
    ],
  },
  {
    countyFips: "01009",
    evidenceLevel: "statewide-only",
    auditSummary:
      "Blount County public sources reference invasive plant management work, but the reviewed official material still falls short of a county-specific invasive inventory or formal detection report.",
    headline: "Blount County is watching weeds closely",
    countySummary:
      "Blount County has visible extension programming around invasive plant management and aquatic weeds, which is useful context but not the same as verified county occurrence evidence. Until stronger county-specific reporting is found, the live county detail should be treated as statewide-source-backed rather than locally enumerated.",
    summaryParagraphs: [
      "Blount County clearly has local attention on invasive plants and aquatic weeds, which matters. The problem is that the public record still reads more like management work than a county-by-county inventory people can rely on.",
      "That leaves the county in a middle ground: active local concern, but not enough county-specific reporting to treat the current view as fully local.",
    ],
    lastReviewedOn: "2026-04-20",
    resources: [
      {
        label: "Blount County Extension Office",
        url: "https://www.aces.edu/counties/blount/",
        kind: "county-extension",
      },
      {
        label: "Blount County Annual Report",
        url: "https://www.aces.edu/blog/topics/blount/blount-county-annual-report/",
        kind: "county-program",
      },
      {
        label: "Alabama Forestry Commission Invasive Species",
        url: "https://forestry.alabama.gov/Pages/Fire/Invasive_Species.aspx",
        kind: "statewide-program",
      },
    ],
  },
  {
    countyFips: "01011",
    evidenceLevel: "statewide-only",
    auditSummary:
      "Bullock County has public reporting on invasive plant management activity, but no county-specific invasive species list or county detection report strong enough to change the live map has been verified.",
    headline: "Bullock County manages weeds without a list",
    countySummary:
      "Bullock County shows useful county agricultural and extension activity, including invasive plant management and aquatic weed work. That is meaningful local context, but it is still programming evidence rather than a county occurrence dataset, so the county remains in the statewide-only evidence tier for now.",
    summaryParagraphs: [
      "Bullock County is clearly doing local work around invasive plants and aquatic weeds, which is better than silence. What it still does not have in public view is a county-specific invasive list or detection record strong enough to tighten the map itself.",
      "So the county detail can talk honestly about local concern, but it still has to stay conservative about county-by-county claims.",
    ],
    lastReviewedOn: "2026-04-20",
    resources: [
      {
        label: "Bullock County Extension Office",
        url: "https://www.aces.edu/counties/bullock/",
        kind: "county-extension",
      },
      {
        label: "Bullock County Annual Report PDF",
        url: "https://www.aces.edu/wp-content/uploads/2023/10/ACES-2750-BullockCountyAnnualReport2022_090123L-G.pdf",
        kind: "county-program",
      },
      {
        label: "Alabama Forestry Commission Invasive Species",
        url: "https://forestry.alabama.gov/Pages/Fire/Invasive_Species.aspx",
        kind: "statewide-program",
      },
    ],
  },
  {
    countyFips: "01013",
    evidenceLevel: "statewide-only",
    auditSummary:
      "Butler County has a verified county extension source path, but the reviewed official public pages do not yet provide county-specific invasive occurrence evidence that meets the current bar.",
    headline: "Butler County still lacks a local list",
    countySummary:
      "Butler County has been reviewed and currently remains a statewide-source county in the audit. Local extension pages are public and attributable, but they do not yet expose the kind of county-specific invasive list, dashboard, or detection notice needed for stronger county detail claims.",
    summaryParagraphs: [
      "Butler County has a real public source path through local extension pages, but it still does not surface the kind of county-specific invasive list or detection notice that would make the county view feel truly local.",
      "Until that changes, the county detail should stay useful and readable without pretending the audit is further along than it is.",
    ],
    lastReviewedOn: "2026-04-20",
    resources: [
      {
        label: "Butler County Extension Office",
        url: "https://www.aces.edu/counties/butler/",
        kind: "county-extension",
      },
      {
        label: "Butler County Extension Category Page",
        url: "https://www.aces.edu/blog/category/counties/butler/",
        kind: "county-program",
      },
      {
        label: "Alabama Forestry Commission Invasive Species",
        url: "https://forestry.alabama.gov/Pages/Fire/Invasive_Species.aspx",
        kind: "statewide-program",
      },
    ],
  },
  {
    countyFips: "01015",
    evidenceLevel: "statewide-only",
    auditSummary:
      "Calhoun County public sources show pest-management and agriculture programming, but the reviewed official material still does not support a county-specific invasive occurrence claim.",
    headline: "Calhoun County needs stronger local proof",
    countySummary:
      "Calhoun County has attributable public sources and active county extension coverage, but the reviewed source stack remains too general for county-level invasive occurrence claims. Until a county-specific list, viewer, or official detection notice is verified, the county detail should stay conservative.",
    summaryParagraphs: [
      "Calhoun County has enough public activity to show that invasive species are on the local radar. What it still does not have is the kind of county-specific list, viewer, or official detection notice that would let us sharpen the county detail with confidence.",
      "For now, the county view should feel like a careful heads-up, not a final word on what is present there.",
    ],
    lastReviewedOn: "2026-04-20",
    resources: [
      {
        label: "Calhoun County Extension Office",
        url: "https://www.aces.edu/counties/calhoun/",
        kind: "county-extension",
      },
      {
        label: "Calhoun County Extension Category Page",
        url: "https://www.aces.edu/blog/category/counties/calhoun/",
        kind: "county-program",
      },
      {
        label: "Alabama Forestry Commission Invasive Species",
        url: "https://forestry.alabama.gov/Pages/Fire/Invasive_Species.aspx",
        kind: "statewide-program",
      },
    ],
  },
  {
    countyFips: "01017",
    evidenceLevel: "statewide-only",
    auditSummary:
      "Chambers County has a reviewed official source path, but no county-specific invasive list or detection report strong enough for production use has been verified from the public sources checked so far.",
    headline: "Chambers County still leans statewide",
    countySummary:
      "Chambers County currently depends on statewide and federal invasive datasets inside Project Isitusa. The audit verified local public extension sources, but those materials still do not provide county-specific invasive occurrence evidence that would justify a more aggressive county summary.",
    summaryParagraphs: [
      "Chambers County still leans mostly on statewide and federal invasive datasets in the live explorer. The local public source trail is there, but it has not yet produced a county-specific list or report strong enough to justify a more confident local summary.",
      "That makes this county a good example of why the audit matters: public awareness exists, but public county evidence is still catching up.",
    ],
    lastReviewedOn: "2026-04-20",
    resources: [
      {
        label: "Chambers County Extension Office",
        url: "https://www.aces.edu/counties/chambers/",
        kind: "county-extension",
      },
      {
        label: "Chambers County Extension Category Page",
        url: "https://www.aces.edu/blog/category/counties/chambers/",
        kind: "county-program",
      },
      {
        label: "Alabama Forestry Commission Invasive Species",
        url: "https://forestry.alabama.gov/Pages/Fire/Invasive_Species.aspx",
        kind: "statewide-program",
      },
    ],
  },
  {
    countyFips: "01019",
    evidenceLevel: "statewide-only",
    auditSummary:
      "Cherokee County has attributable county extension pages, but the reviewed official public sources do not yet support a county-specific invasive occurrence claim or county inventory.",
    headline: "Cherokee County still needs local reporting",
    countySummary:
      "Cherokee County remains in the statewide-only evidence tier for now. The audit confirmed legitimate county extension coverage, but no county-specific invasive species list, dashboard, or formal detection report has been verified from the public sources reviewed so far.",
    summaryParagraphs: [
      "Cherokee County has real county extension coverage, but the reviewed public sources still do not give residents a county-specific invasive inventory or formal detection report they can lean on.",
      "For now, the county detail is best read as a clear local caution sign built on broader datasets while the county audit keeps digging.",
    ],
    lastReviewedOn: "2026-04-20",
    resources: [
      {
        label: "Cherokee County Extension Office",
        url: "https://www.aces.edu/counties/cherokee/",
        kind: "county-extension",
      },
      {
        label: "Cherokee County Extension Category Page",
        url: "https://www.aces.edu/blog/category/counties/cherokee/",
        kind: "county-program",
      },
      {
        label: "Alabama Forestry Commission Invasive Species",
        url: "https://forestry.alabama.gov/Pages/Fire/Invasive_Species.aspx",
        kind: "statewide-program",
      },
    ],
  },
  {
    countyFips: "01021",
    evidenceLevel: "statewide-only",
    auditSummary:
      "Chilton County has a reviewed official source path, but the public sources checked so far do not yet expose a county-specific invasive list or formal detection notice strong enough for production use.",
    headline: "Chilton County still leans statewide",
    countySummary:
      "Chilton County currently remains in the statewide-only evidence tier. The county audit confirmed local extension coverage and an attributable county source trail, but it did not verify a county-specific invasive species list, dashboard, or detection notice that would justify a stronger local claim.",
    summaryParagraphs: [
      "Chilton County has enough local public structure to keep reviewing with confidence, but the current county source path still stops short of a county-specific invasive inventory or formal detection record.",
      "That means the live explorer should stay readable and useful here without pretending the county audit has more local proof than it really does.",
    ],
    lastReviewedOn: "2026-04-20",
    resources: [
      {
        label: "Chilton County Extension Office",
        url: "https://www.aces.edu/counties/chilton/",
        kind: "county-extension",
      },
      {
        label: "Chilton County Extension Category Page",
        url: "https://www.aces.edu/blog/category/counties/chilton/",
        kind: "county-program",
      },
      {
        label: "Alabama Forestry Commission Invasive Species",
        url: "https://forestry.alabama.gov/Pages/Fire/Invasive_Species.aspx",
        kind: "statewide-program",
      },
    ],
  },
  {
    countyFips: "01023",
    evidenceLevel: "statewide-only",
    auditSummary:
      "Choctaw County has attributable local extension pages, but the reviewed official public sources do not yet support a county-specific invasive occurrence claim.",
    headline: "Choctaw County still needs local proof",
    countySummary:
      "Choctaw County remains dependent on statewide and federal invasive datasets in the live explorer for now. The county audit verified a real local source path through county extension pages, but it still did not surface a county-specific invasive list, viewer, or formal detection notice.",
    summaryParagraphs: [
      "Choctaw County has a credible county-level public source path, but the reviewed official material still reads as extension and program context rather than county occurrence evidence.",
      "Until a county-specific list or report is verified, the county detail should stay conservative and honest about that gap.",
    ],
    lastReviewedOn: "2026-04-20",
    resources: [
      {
        label: "Choctaw County Extension Office",
        url: "https://www.aces.edu/counties/choctaw/",
        kind: "county-extension",
      },
      {
        label: "Choctaw County Extension Category Page",
        url: "https://www.aces.edu/blog/category/counties/choctaw/",
        kind: "county-program",
      },
      {
        label: "Alabama Forestry Commission Invasive Species",
        url: "https://forestry.alabama.gov/Pages/Fire/Invasive_Species.aspx",
        kind: "statewide-program",
      },
    ],
  },
  {
    countyFips: "01025",
    evidenceLevel: "statewide-only",
    auditSummary:
      "Clarke County has reviewed official county pages, but no county-specific invasive list or detection notice strong enough for production use has been verified yet.",
    headline: "Clarke County still lacks a local list",
    countySummary:
      "Clarke County has been reviewed against the current Alabama statewide source plus county extension pages. Those sources are legitimate and attributable, but they still do not provide the county-specific invasive occurrence evidence needed for a sharper county summary.",
    summaryParagraphs: [
      "Clarke County is another case where the local public source trail is real, but it has not yet turned into a county-specific invasive list, dashboard, or formal detection report.",
      "For now, the county view is still best read as a broad signal built from stronger statewide and federal datasets.",
    ],
    lastReviewedOn: "2026-04-20",
    resources: [
      {
        label: "Clarke County Extension Office",
        url: "https://www.aces.edu/counties/clarke/",
        kind: "county-extension",
      },
      {
        label: "Clarke County Extension Category Page",
        url: "https://www.aces.edu/blog/category/counties/clarke/",
        kind: "county-program",
      },
      {
        label: "Alabama Forestry Commission Invasive Species",
        url: "https://forestry.alabama.gov/Pages/Fire/Invasive_Species.aspx",
        kind: "statewide-program",
      },
    ],
  },
  {
    countyFips: "01027",
    evidenceLevel: "statewide-only",
    auditSummary:
      "Clay County public extension sources are attributable, but the reviewed official material still does not verify county-specific invasive occurrence reporting.",
    headline: "Clay County still runs on broader data",
    countySummary:
      "Clay County remains in the statewide-only evidence tier after the current county audit pass. The reviewed county extension office and category sources help confirm local public capacity, but they do not yet amount to a county-specific invasive list or formal detection notice.",
    summaryParagraphs: [
      "Clay County has enough reviewed local context to show the audit is not guessing, but it still lacks the county-specific invasive reporting needed for a stronger production claim.",
      "So the county detail should stay practical and cautious while the broader Alabama source path keeps expanding.",
    ],
    lastReviewedOn: "2026-04-20",
    resources: [
      {
        label: "Clay County Extension Office",
        url: "https://www.aces.edu/counties/clay/",
        kind: "county-extension",
      },
      {
        label: "Clay County Extension Category Page",
        url: "https://www.aces.edu/blog/category/counties/clay/",
        kind: "county-program",
      },
      {
        label: "Alabama Forestry Commission Invasive Species",
        url: "https://forestry.alabama.gov/Pages/Fire/Invasive_Species.aspx",
        kind: "statewide-program",
      },
    ],
  },
  {
    countyFips: "01029",
    evidenceLevel: "statewide-only",
    auditSummary:
      "Cleburne County has a reviewed official source path, but no county-specific invasive list, dashboard, or detection notice strong enough for production use has been verified from the public sources checked so far.",
    headline: "Cleburne County still needs local reporting",
    countySummary:
      "Cleburne County still leans on statewide and federal invasive datasets in the live explorer. The county audit verified local extension sources, but those materials do not yet provide county-specific invasive occurrence evidence that would support a more aggressive local summary.",
    summaryParagraphs: [
      "Cleburne County has a legitimate local public source trail, but it still has not surfaced the kind of county-specific invasive reporting that would let the county detail feel truly local.",
      "That keeps the county in the same conservative evidence tier as most Alabama counties reviewed so far.",
    ],
    lastReviewedOn: "2026-04-20",
    resources: [
      {
        label: "Cleburne County Extension Office",
        url: "https://www.aces.edu/counties/cleburne/",
        kind: "county-extension",
      },
      {
        label: "Cleburne County Extension Category Page",
        url: "https://www.aces.edu/blog/category/counties/cleburne/",
        kind: "county-program",
      },
      {
        label: "Alabama Forestry Commission Invasive Species",
        url: "https://forestry.alabama.gov/Pages/Fire/Invasive_Species.aspx",
        kind: "statewide-program",
      },
    ],
  },
  {
    countyFips: "01031",
    evidenceLevel: "statewide-only",
    auditSummary:
      "Coffee County has reviewed official county extension sources, but the public material checked so far does not verify county-specific invasive occurrence reporting.",
    headline: "Coffee County still leans on broader coverage",
    countySummary:
      "Coffee County remains in the statewide-only evidence tier after the current audit pass. The county source path is real and attributable, but it still does not expose a county-specific invasive list, dashboard, or formal detection notice strong enough for sharper county-level claims.",
    summaryParagraphs: [
      "Coffee County has enough local public structure to keep the audit grounded, but the reviewed official sources still stop short of county-specific invasive occurrence evidence.",
      "That keeps the live county detail in the careful-awareness lane instead of pretending it is already a finished local inventory.",
    ],
    lastReviewedOn: "2026-04-20",
    resources: [
      {
        label: "Coffee County Extension Office",
        url: "https://www.aces.edu/counties/coffee/",
        kind: "county-extension",
      },
      {
        label: "Coffee County Extension Category Page",
        url: "https://www.aces.edu/blog/category/counties/coffee/",
        kind: "county-program",
      },
      {
        label: "Alabama Forestry Commission Invasive Species",
        url: "https://forestry.alabama.gov/Pages/Fire/Invasive_Species.aspx",
        kind: "statewide-program",
      },
    ],
  },
  {
    countyFips: "01033",
    evidenceLevel: "statewide-only",
    auditSummary:
      "Colbert County has a reviewed official source path, but the public county material checked so far does not support a county-specific invasive occurrence claim.",
    headline: "Colbert County still needs local proof",
    countySummary:
      "Colbert County currently still depends on statewide and federal invasive datasets in the live explorer. The audit verified local extension pages, but it did not surface a county-specific invasive list, viewer, or formal detection notice that would justify stronger county language.",
    summaryParagraphs: [
      "Colbert County has a legitimate local public source trail, but the reviewed material still reads as county program context rather than county occurrence evidence.",
      "Until that changes, the county detail should stay direct and useful without overstating what the public source stack can prove.",
    ],
    lastReviewedOn: "2026-04-20",
    resources: [
      {
        label: "Colbert County Extension Office",
        url: "https://www.aces.edu/counties/colbert/",
        kind: "county-extension",
      },
      {
        label: "Colbert County Extension Category Page",
        url: "https://www.aces.edu/blog/category/counties/colbert/",
        kind: "county-program",
      },
      {
        label: "Alabama Forestry Commission Invasive Species",
        url: "https://forestry.alabama.gov/Pages/Fire/Invasive_Species.aspx",
        kind: "statewide-program",
      },
    ],
  },
  {
    countyFips: "01035",
    evidenceLevel: "statewide-only",
    auditSummary:
      "Conecuh County has reviewed official county pages, but no county-specific invasive list or detection notice strong enough for production use has been verified yet.",
    headline: "Conecuh County still lacks a local list",
    countySummary:
      "Conecuh County has been reviewed against the current Alabama statewide baseline plus county extension sources. Those materials are attributable, but they still do not provide county-specific invasive occurrence evidence strong enough to tighten the county detail.",
    summaryParagraphs: [
      "Conecuh County is another case where the local public source path exists, but it has not yet turned into a county-specific invasive list, map, or formal detection record.",
      "For now, the live county view is still best read as broader awareness context rather than a finished county inventory.",
    ],
    lastReviewedOn: "2026-04-20",
    resources: [
      {
        label: "Conecuh County Extension Office",
        url: "https://www.aces.edu/counties/conecuh/",
        kind: "county-extension",
      },
      {
        label: "Conecuh County Extension Category Page",
        url: "https://www.aces.edu/blog/category/counties/conecuh/",
        kind: "county-program",
      },
      {
        label: "Alabama Forestry Commission Invasive Species",
        url: "https://forestry.alabama.gov/Pages/Fire/Invasive_Species.aspx",
        kind: "statewide-program",
      },
    ],
  },
  {
    countyFips: "01037",
    evidenceLevel: "statewide-only",
    auditSummary:
      "Coosa County public extension sources are attributable, but the reviewed official material still does not verify county-specific invasive occurrence reporting.",
    headline: "Coosa County still runs on statewide evidence",
    countySummary:
      "Coosa County remains in the statewide-only evidence tier after this audit pass. The reviewed county extension office and category sources confirm a real local source trail, but they do not yet amount to a county-specific invasive list or formal detection notice.",
    summaryParagraphs: [
      "Coosa County has enough reviewed local context to keep the audit grounded, but it still lacks the county-specific invasive reporting needed for stronger county-level claims.",
      "So the county detail should stay practical and cautious while Alabama's broader local-source picture keeps developing.",
    ],
    lastReviewedOn: "2026-04-20",
    resources: [
      {
        label: "Coosa County Extension Office",
        url: "https://www.aces.edu/counties/coosa/",
        kind: "county-extension",
      },
      {
        label: "Coosa County Extension Category Page",
        url: "https://www.aces.edu/blog/category/counties/coosa/",
        kind: "county-program",
      },
      {
        label: "Alabama Forestry Commission Invasive Species",
        url: "https://forestry.alabama.gov/Pages/Fire/Invasive_Species.aspx",
        kind: "statewide-program",
      },
    ],
  },
  {
    countyFips: "01039",
    evidenceLevel: "statewide-only",
    auditSummary:
      "Covington County has a reviewed official source path, but no county-specific invasive list, dashboard, or detection notice strong enough for production use has been verified from the public sources checked so far.",
    headline: "Covington County still needs local reporting",
    countySummary:
      "Covington County still leans on statewide and federal invasive datasets in the live explorer. The county audit verified local extension sources, but those materials do not yet provide county-specific invasive occurrence evidence that would support stronger county-level wording.",
    summaryParagraphs: [
      "Covington County has a legitimate local public source trail, but it still has not surfaced the kind of county-specific invasive reporting that would make the county detail feel truly local.",
      "That keeps the county in the same conservative evidence tier as most Alabama counties reviewed so far.",
    ],
    lastReviewedOn: "2026-04-20",
    resources: [
      {
        label: "Covington County Extension Office",
        url: "https://www.aces.edu/counties/covington/",
        kind: "county-extension",
      },
      {
        label: "Covington County Extension Category Page",
        url: "https://www.aces.edu/blog/category/counties/covington/",
        kind: "county-program",
      },
      {
        label: "Alabama Forestry Commission Invasive Species",
        url: "https://forestry.alabama.gov/Pages/Fire/Invasive_Species.aspx",
        kind: "statewide-program",
      },
    ],
  },
  {
    countyFips: "01041",
    evidenceLevel: "statewide-only",
    auditSummary:
      "Crenshaw County has reviewed official county extension sources, but the public material checked so far does not verify county-specific invasive occurrence reporting.",
    headline: "Crenshaw County still leans on broader coverage",
    countySummary:
      "Crenshaw County remains in the statewide-only evidence tier after the current audit pass. The county source path is real and attributable, but it still does not expose a county-specific invasive list, dashboard, or formal detection notice strong enough for sharper county-level claims.",
    summaryParagraphs: [
      "Crenshaw County has enough local public structure to keep the audit grounded, but the reviewed official sources still stop short of county-specific invasive occurrence evidence.",
      "That keeps the live county detail in the careful-awareness lane instead of pretending it is already a finished local inventory.",
    ],
    lastReviewedOn: "2026-04-20",
    resources: [
      {
        label: "Crenshaw County Extension Office",
        url: "https://www.aces.edu/counties/crenshaw/",
        kind: "county-extension",
      },
      {
        label: "Crenshaw County Extension Category Page",
        url: "https://www.aces.edu/blog/category/counties/crenshaw/",
        kind: "county-program",
      },
      {
        label: "Alabama Forestry Commission Invasive Species",
        url: "https://forestry.alabama.gov/Pages/Fire/Invasive_Species.aspx",
        kind: "statewide-program",
      },
    ],
  },
  {
    countyFips: "01043",
    evidenceLevel: "statewide-only",
    auditSummary:
      "Cullman County has a reviewed official source path, but the public county material checked so far does not support a county-specific invasive occurrence claim.",
    headline: "Cullman County still needs local proof",
    countySummary:
      "Cullman County currently still depends on statewide and federal invasive datasets in the live explorer. The audit verified local extension pages, but it did not surface a county-specific invasive list, viewer, or formal detection notice that would justify stronger county language.",
    summaryParagraphs: [
      "Cullman County has a legitimate local public source trail, but the reviewed material still reads as county program context rather than county occurrence evidence.",
      "Until that changes, the county detail should stay direct and useful without overstating what the public source stack can prove.",
    ],
    lastReviewedOn: "2026-04-20",
    resources: [
      {
        label: "Cullman County Extension Office",
        url: "https://www.aces.edu/counties/cullman/",
        kind: "county-extension",
      },
      {
        label: "Cullman County Extension Category Page",
        url: "https://www.aces.edu/blog/category/counties/cullman/",
        kind: "county-program",
      },
      {
        label: "Alabama Forestry Commission Invasive Species",
        url: "https://forestry.alabama.gov/Pages/Fire/Invasive_Species.aspx",
        kind: "statewide-program",
      },
    ],
  },
  {
    countyFips: "01045",
    evidenceLevel: "statewide-only",
    auditSummary:
      "Dale County has reviewed official county pages, but no county-specific invasive list or detection notice strong enough for production use has been verified yet.",
    headline: "Dale County still lacks a local list",
    countySummary:
      "Dale County has been reviewed against the current Alabama statewide baseline plus county extension sources. Those materials are attributable, but they still do not provide county-specific invasive occurrence evidence strong enough to tighten the county detail.",
    summaryParagraphs: [
      "Dale County is another case where the local public source path exists, but it has not yet turned into a county-specific invasive list, map, or formal detection record.",
      "For now, the live county view is still best read as broader awareness context rather than a finished county inventory.",
    ],
    lastReviewedOn: "2026-04-20",
    resources: [
      {
        label: "Dale County Extension Office",
        url: "https://www.aces.edu/counties/dale/",
        kind: "county-extension",
      },
      {
        label: "Dale County Extension Category Page",
        url: "https://www.aces.edu/blog/category/counties/dale/",
        kind: "county-program",
      },
      {
        label: "Alabama Forestry Commission Invasive Species",
        url: "https://forestry.alabama.gov/Pages/Fire/Invasive_Species.aspx",
        kind: "statewide-program",
      },
    ],
  },
  {
    countyFips: "01047",
    evidenceLevel: "statewide-only",
    auditSummary:
      "Dallas County public extension sources are attributable, but the reviewed official material still does not verify county-specific invasive occurrence reporting.",
    headline: "Dallas County still runs on statewide evidence",
    countySummary:
      "Dallas County remains in the statewide-only evidence tier after this audit pass. The reviewed county extension office and category sources confirm a real local source trail, but they do not yet amount to a county-specific invasive list or formal detection notice.",
    summaryParagraphs: [
      "Dallas County has enough reviewed local context to keep the audit grounded, but it still lacks the county-specific invasive reporting needed for stronger county-level claims.",
      "So the county detail should stay practical and cautious while Alabama's broader local-source picture keeps developing.",
    ],
    lastReviewedOn: "2026-04-20",
    resources: [
      {
        label: "Dallas County Extension Office",
        url: "https://www.aces.edu/counties/dallas/",
        kind: "county-extension",
      },
      {
        label: "Dallas County Extension Category Page",
        url: "https://www.aces.edu/blog/category/counties/dallas/",
        kind: "county-program",
      },
      {
        label: "Alabama Forestry Commission Invasive Species",
        url: "https://forestry.alabama.gov/Pages/Fire/Invasive_Species.aspx",
        kind: "statewide-program",
      },
    ],
  },
  {
    countyFips: "01049",
    evidenceLevel: "statewide-only",
    auditSummary:
      "DeKalb County has a reviewed official source path, but no county-specific invasive list, dashboard, or detection notice strong enough for production use has been verified from the public sources checked so far.",
    headline: "DeKalb County still needs local reporting",
    countySummary:
      "DeKalb County still leans on statewide and federal invasive datasets in the live explorer. The county audit verified local extension sources, but those materials do not yet provide county-specific invasive occurrence evidence that would support stronger county-level wording.",
    summaryParagraphs: [
      "DeKalb County has a legitimate local public source trail, but it still has not surfaced the kind of county-specific invasive reporting that would make the county detail feel truly local.",
      "That keeps the county in the same conservative evidence tier as most Alabama counties reviewed so far.",
    ],
    lastReviewedOn: "2026-04-20",
    resources: [
      {
        label: "DeKalb County Extension Office",
        url: "https://www.aces.edu/counties/dekalb/",
        kind: "county-extension",
      },
      {
        label: "DeKalb County Extension Category Page",
        url: "https://www.aces.edu/blog/category/counties/dekalb/",
        kind: "county-program",
      },
      {
        label: "Alabama Forestry Commission Invasive Species",
        url: "https://forestry.alabama.gov/Pages/Fire/Invasive_Species.aspx",
        kind: "statewide-program",
      },
    ],
  },
  {
    countyFips: "01051",
    evidenceLevel: "statewide-only",
    auditSummary:
      "Elmore County has reviewed official county extension sources, but the public material checked so far does not verify county-specific invasive occurrence reporting.",
    headline: "Elmore County still leans on broader coverage",
    countySummary:
      "Elmore County remains in the statewide-only evidence tier after the current audit pass. The county source path is real and attributable, but it still does not expose a county-specific invasive list, dashboard, or formal detection notice strong enough for sharper county-level claims.",
    summaryParagraphs: [
      "Elmore County has enough local public structure to keep the audit grounded, but the reviewed official sources still stop short of county-specific invasive occurrence evidence.",
      "That keeps the live county detail in the careful-awareness lane instead of pretending it is already a finished local inventory.",
    ],
    lastReviewedOn: "2026-04-20",
    resources: [
      {
        label: "Elmore County Extension Office",
        url: "https://www.aces.edu/counties/elmore/",
        kind: "county-extension",
      },
      {
        label: "Elmore County Extension Category Page",
        url: "https://www.aces.edu/blog/category/counties/elmore/",
        kind: "county-program",
      },
      {
        label: "Alabama Forestry Commission Invasive Species",
        url: "https://forestry.alabama.gov/Pages/Fire/Invasive_Species.aspx",
        kind: "statewide-program",
      },
    ],
  },
  {
    countyFips: "01053",
    evidenceLevel: "statewide-only",
    auditSummary:
      "Escambia County has a reviewed official source path, but the public county material checked so far does not support a county-specific invasive occurrence claim.",
    headline: "Escambia County still needs local proof",
    countySummary:
      "Escambia County currently still depends on statewide and federal invasive datasets in the live explorer. The audit verified local extension pages, but it did not surface a county-specific invasive list, viewer, or formal detection notice that would justify stronger county language.",
    summaryParagraphs: [
      "Escambia County has a legitimate local public source trail, but the reviewed material still reads as county program context rather than county occurrence evidence.",
      "Until that changes, the county detail should stay direct and useful without overstating what the public source stack can prove.",
    ],
    lastReviewedOn: "2026-04-20",
    resources: [
      {
        label: "Escambia County Extension Office",
        url: "https://www.aces.edu/counties/escambia/",
        kind: "county-extension",
      },
      {
        label: "Escambia County Extension Category Page",
        url: "https://www.aces.edu/blog/category/counties/escambia/",
        kind: "county-program",
      },
      {
        label: "Alabama Forestry Commission Invasive Species",
        url: "https://forestry.alabama.gov/Pages/Fire/Invasive_Species.aspx",
        kind: "statewide-program",
      },
    ],
  },
  {
    countyFips: "01055",
    evidenceLevel: "statewide-only",
    auditSummary:
      "Etowah County has reviewed official county pages, but no county-specific invasive list or detection notice strong enough for production use has been verified yet.",
    headline: "Etowah County still lacks a local list",
    countySummary:
      "Etowah County has been reviewed against the current Alabama statewide baseline plus county extension sources. Those materials are attributable, but they still do not provide county-specific invasive occurrence evidence strong enough to tighten the county detail.",
    summaryParagraphs: [
      "Etowah County is another case where the local public source path exists, but it has not yet turned into a county-specific invasive list, map, or formal detection record.",
      "For now, the live county view is still best read as broader awareness context rather than a finished county inventory.",
    ],
    lastReviewedOn: "2026-04-20",
    resources: [
      {
        label: "Etowah County Extension Office",
        url: "https://www.aces.edu/counties/etowah/",
        kind: "county-extension",
      },
      {
        label: "Etowah County Extension Category Page",
        url: "https://www.aces.edu/blog/category/counties/etowah/",
        kind: "county-program",
      },
      {
        label: "Alabama Forestry Commission Invasive Species",
        url: "https://forestry.alabama.gov/Pages/Fire/Invasive_Species.aspx",
        kind: "statewide-program",
      },
    ],
  },
  {
    countyFips: "01057",
    evidenceLevel: "statewide-only",
    auditSummary:
      "Fayette County public extension sources are attributable, but the reviewed official material still does not verify county-specific invasive occurrence reporting.",
    headline: "Fayette County still runs on statewide evidence",
    countySummary:
      "Fayette County remains in the statewide-only evidence tier after this audit pass. The reviewed county extension office and category sources confirm a real local source trail, but they do not yet amount to a county-specific invasive list or formal detection notice.",
    summaryParagraphs: [
      "Fayette County has enough reviewed local context to keep the audit grounded, but it still lacks the county-specific invasive reporting needed for stronger county-level claims.",
      "So the county detail should stay practical and cautious while Alabama's broader local-source picture keeps developing.",
    ],
    lastReviewedOn: "2026-04-20",
    resources: [
      {
        label: "Fayette County Extension Office",
        url: "https://www.aces.edu/counties/fayette/",
        kind: "county-extension",
      },
      {
        label: "Fayette County Extension Category Page",
        url: "https://www.aces.edu/blog/category/counties/fayette/",
        kind: "county-program",
      },
      {
        label: "Alabama Forestry Commission Invasive Species",
        url: "https://forestry.alabama.gov/Pages/Fire/Invasive_Species.aspx",
        kind: "statewide-program",
      },
    ],
  },
  {
    countyFips: "01059",
    evidenceLevel: "statewide-only",
    auditSummary:
      "Franklin County has a reviewed official source path, but no county-specific invasive list, dashboard, or detection notice strong enough for production use has been verified from the public sources checked so far.",
    headline: "Franklin County still needs local reporting",
    countySummary:
      "Franklin County still leans on statewide and federal invasive datasets in the live explorer. The county audit verified local extension sources, but those materials do not yet provide county-specific invasive occurrence evidence that would support stronger county-level wording.",
    summaryParagraphs: [
      "Franklin County has a legitimate local public source trail, but it still has not surfaced the kind of county-specific invasive reporting that would make the county detail feel truly local.",
      "That keeps the county in the same conservative evidence tier as most Alabama counties reviewed so far.",
    ],
    lastReviewedOn: "2026-04-20",
    resources: [
      {
        label: "Franklin County Extension Office",
        url: "https://www.aces.edu/counties/franklin/",
        kind: "county-extension",
      },
      {
        label: "Franklin County Extension Category Page",
        url: "https://www.aces.edu/blog/category/counties/franklin/",
        kind: "county-program",
      },
      {
        label: "Alabama Forestry Commission Invasive Species",
        url: "https://forestry.alabama.gov/Pages/Fire/Invasive_Species.aspx",
        kind: "statewide-program",
      },
    ],
  },
];
