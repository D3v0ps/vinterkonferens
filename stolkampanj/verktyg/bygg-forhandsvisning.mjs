// Skapar index.html (fristående sida / förhandsvisning) från wordpress-block.html.
// Kör efter att du ändrat i blocket:   node stolkampanj/verktyg/bygg-forhandsvisning.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const mapp = join(dirname(fileURLToPath(import.meta.url)), "..");
const block = readFileSync(join(mapp, "wordpress-block.html"), "utf8");

const sida = `<!doctype html>
<html lang="sv">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ge en stol till Stockholms moské</title>
<meta name="description" content="Stockholms moské köper in 400 stolar så att äldre och den som inte kan sitta på golvet får en plats i bönen. En stol kostar 500 kr – swisha ”stol”.">
<meta property="og:title" content="Ge en stol till Stockholms moské">
<meta property="og:description" content="400 stolar · 500 kr per stol · Swisha ”stol”. Följ insamlingen live.">
<meta name="theme-color" content="#23256f">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
  html{background:#f4f2ec}
  body{margin:0;padding:16px;background:#f4f2ec}
  @media (min-width:720px){body{padding:32px}}
</style>
</head>
<body>
<!-- GENERERAD FIL – ändra i wordpress-block.html och kör verktyg/bygg-forhandsvisning.mjs -->
${block.trim()}
</body>
</html>
`;

writeFileSync(join(mapp, "index.html"), sida);
console.log("Skrev", join(mapp, "index.html"));
