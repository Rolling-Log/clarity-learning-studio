// Uses Open Intelligent UI's original document assembler and design system.
import { assembleDocument } from "./vendor/oiui-renderer.mjs";
import { normalizeGuide } from "./netlify/lib/visual-contract.mjs";
import { renderGuide } from "./netlify/lib/visual-renderer.mjs";
let input = "";
for await (const chunk of process.stdin) input += chunk;
const payload = JSON.parse(input);
if (payload.guide) {
  try {
    const guide = normalizeGuide(payload.guide, payload.passages);
    process.stdout.write(JSON.stringify({guide, html:renderGuide(guide)}));
  } catch (error) {
    if (error.constructor.name !== "InvalidLesson") throw error;
    process.exitCode = 2;
  }
} else {
  process.stdout.write(assembleDocument(payload.html));
}
