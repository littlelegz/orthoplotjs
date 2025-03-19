require('ts-node').register();
const genome2json = require('./src/genome2json.ts');
const fs = require('fs');
const path = require('path');

const testGenome = genome2json.parseGFFDirectoryToJSON('./example/mult');
// Add ortho annotations to the genome
const orthos = genome2json.addOrthoTags(testGenome, './example/ortho.txt');

//write out to file
const outputPath = path.join(__dirname, 'example', 'testGenome.json');
console.log(testGenome);
fs.writeFileSync(outputPath, JSON.stringify(testGenome.genomes, null, 2), 'utf8');
console.log(`Genome JSON written to ${outputPath}`);
