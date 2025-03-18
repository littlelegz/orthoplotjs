require('ts-node').register();
const genome2json = require('./src/genome2json.ts');
const fs = require('fs');
const path = require('path');

const testGenome = genome2json.gff2json('testGenome', './example/GTDB-02493_trunc.gff');

//write out to file
const outputPath = path.join(__dirname, 'example', 'testGenome.json');
fs.writeFileSync(outputPath, JSON.stringify(testGenome, null, 2), 'utf8');
console.log(`Genome JSON written to ${outputPath}`);
