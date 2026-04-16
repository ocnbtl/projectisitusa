import { speciesSeed } from "../src/data/source/species";

const forbiddenDashPattern = /[\u2013\u2014]/;

const requiredActionModes = new Set(["diy", "report", "both"]);

const curatedSpecies = speciesSeed.filter((species) => species.profileType === "curated");
const failures: string[] = [];

for (const species of curatedSpecies) {
  const baseRef = `${species.slug}`;
  const textFields = [
    ["summary", species.summary],
    ["origin", species.origin],
    ["whyItMatters", species.whyItMatters],
  ] as const;

  for (const [field, value] of textFields) {
    if (!value || value.trim().length < 40) {
      failures.push(`${baseRef}: ${field} is missing or too short`);
      continue;
    }

    if (forbiddenDashPattern.test(value)) {
      failures.push(`${baseRef}: ${field} contains an em dash or en dash`);
    }
  }

  if (!species.whatToLookFor || species.whatToLookFor.length < 3) {
    failures.push(`${baseRef}: whatToLookFor needs at least 3 items`);
  } else {
    species.whatToLookFor.forEach((item, index) => {
      if (!item.trim()) {
        failures.push(`${baseRef}: whatToLookFor[${index}] is empty`);
      }

      if (forbiddenDashPattern.test(item)) {
        failures.push(`${baseRef}: whatToLookFor[${index}] contains an em dash or en dash`);
      }
    });
  }

  if (!species.action) {
    failures.push(`${baseRef}: action block is missing`);
  } else {
    if (!requiredActionModes.has(species.action.mode)) {
      failures.push(`${baseRef}: action.mode is invalid`);
    }

    if (!species.action.summary || species.action.summary.trim().length < 50) {
      failures.push(`${baseRef}: action.summary is missing or too short`);
    } else if (forbiddenDashPattern.test(species.action.summary)) {
      failures.push(`${baseRef}: action.summary contains an em dash or en dash`);
    }

    if (!species.action.steps || species.action.steps.length < 3) {
      failures.push(`${baseRef}: action.steps needs at least 3 items`);
    } else {
      species.action.steps.forEach((step, index) => {
        if (!step.trim()) {
          failures.push(`${baseRef}: action.steps[${index}] is empty`);
        }

        if (forbiddenDashPattern.test(step)) {
          failures.push(`${baseRef}: action.steps[${index}] contains an em dash or en dash`);
        }
      });
    }

    if (species.action.contactInstructions && forbiddenDashPattern.test(species.action.contactInstructions)) {
      failures.push(`${baseRef}: action.contactInstructions contains an em dash or en dash`);
    }

    if (species.action.safetyNotes && forbiddenDashPattern.test(species.action.safetyNotes)) {
      failures.push(`${baseRef}: action.safetyNotes contains an em dash or en dash`);
    }
  }

  if (!species.source.length) {
    failures.push(`${baseRef}: at least 1 source is required`);
  }

  species.source.forEach((source, index) => {
    if (!source.label.trim()) {
      failures.push(`${baseRef}: source[${index}] label is empty`);
    }

    if (!/^https?:\/\//.test(source.url)) {
      failures.push(`${baseRef}: source[${index}] url is not absolute`);
    }
  });
}

if (failures.length) {
  console.error("Curated profile check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Curated profile check passed for ${curatedSpecies.length} curated species.`);
