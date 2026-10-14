import fs from 'node:fs/promises';
import sharp from 'sharp';
for (const name of ['wordmark-green','wordmark-white','wordmark-black','symbol-name','full-name']) {
  await sharp(await fs.readFile(`public/brand/v10/${name}.svg`))
    .resize({width:name==='symbol-name'?840:1800}).png()
    .toFile(`public/brand/v10/${name}.png`);
}
// Existing delivered emails and the currently deployed mailer retain this URL.
// Keep that compatibility image current without changing email-service behavior.
await fs.copyFile('public/brand/v10/symbol-name.png','public/brand/v9/symbol-name.png');
