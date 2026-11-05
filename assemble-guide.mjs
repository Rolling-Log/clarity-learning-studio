// Uses Open Intelligent UI's original document assembler and design system.
import { assembleDocument } from "./vendor/oiui-renderer.mjs";
let input = "";
for await (const chunk of process.stdin) input += chunk;
const payload = JSON.parse(input);
process.stdout.write(assembleDocument(payload.html));
