// Convert the two synchronized GMAT CCSDS-OEM outputs into a browser dataset.
const fs = require("fs");

const [craftFile, stationFile, outputFile] = process.argv.slice(2);
if (!craftFile || !stationFile || !outputFile) {
  throw new Error("Usage: node scripts/convert-gmat-rendezvous.js craft.oem station.oem output.json");
}

function readOem(filename) {
  const text = fs.readFileSync(filename, "utf8");
  if (!/CENTER_NAME\s*=\s*Earth/.test(text) || !/REF_FRAME\s*=\s*EME2000/.test(text) || !/TIME_SYSTEM\s*=\s*UTC/.test(text)) {
    throw new Error(`${filename}: expected Earth-centered EME2000 UTC data`);
  }
  const rows = text.split(/\r?\n/).filter(line => /^\d{4}-\d\d-\d\dT/.test(line)).map(line => {
    const [epoch, ...values] = line.trim().split(/\s+/);
    return [Date.parse(`${epoch}Z`), ...values.map(Number)];
  });
  if (rows.length < 2 || rows.some((row, i) => row.length !== 7 || row.some(value => !Number.isFinite(value)) || (i > 0 && row[0] <= rows[i - 1][0]))) {
    throw new Error(`${filename}: invalid or non-increasing state vectors`);
  }
  return rows;
}

const craft = readOem(craftFile);
const station = readOem(stationFile);
if (craft.length !== station.length || craft.some((row, i) => row[0] !== station[i][0])) {
  throw new Error("Craft and station timestamps do not match");
}
const start = craft[0][0];
const data = {
  name: "ISS-like phasing rendezvous training",
  source: "GMAT R2026a, scripts/gmat-iss-rendezvous.script",
  description: "Illustrative two-body orbit. Station orbit is synthetic; this is not a real ISS ephemeris.",
  epoch: new Date(start).toISOString(),
  frame: "Earth-centered EME2000",
  units: { time: "s", position: "km", velocity: "km/s" },
  samples: craft.map((row, i) => [(row[0] - start) / 1000, ...row.slice(1), ...station[i].slice(1)])
};
fs.writeFileSync(outputFile, JSON.stringify(data));
console.log(`Wrote ${data.samples.length} synchronized states to ${outputFile}`);
