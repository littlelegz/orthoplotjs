const fs = require('fs');
const gff = require('@gmod/gff').default;

interface IGenome {
  genomeName: string;
  contigs: Contig[];
}

interface IContig {
  contigName: string;
  genes: Gene[];
}

interface IGene {
  geneName: string;
  start: number;
  end: number;
  strand: number;
  description: string;
  type: string;
}

class BaseObject {
  [key: string]: any;

  set_attr(attrName: string, attrValue: any): void {
    this[attrName] = attrValue;
  }

  to_dict(): { [key: string]: any } {
    return Object.assign({}, this);
  }

  to_json(indent: number = 2): string {
    return JSON.stringify(this, null, indent);
  }

  toString(): string {
    return JSON.stringify(this.to_dict());
  }
}

export class Genome extends BaseObject implements IGenome {
  genomeName: string;
  contigs: Contig[] = [];

  constructor(genomeName: string) {
    super();
    this.genomeName = genomeName;
  }

  add_contig(contig: Contig): void {
    this.contigs.push(contig);
  }
}

export class GenomeSet extends BaseObject {
  genomes: Genome[] = [];

  constructor(genomes: Genome[]) {
    super();
    this.genomes = genomes;
  }

  add_genome(genome: Genome): void {
    this.genomes.push(genome);
  }
}

export class Contig extends BaseObject implements IContig {
  contigName: string;
  genes: Gene[] = [];

  constructor(contigName: string) {
    super();
    this.contigName = contigName;
  }

  add_gene(gene: Gene): void {
    this.genes.push(gene);
  }
}

export class Gene extends BaseObject implements IGene {
  geneName: string;
  start: number;
  end: number;
  strand: number;
  description: string;
  type: string;

  constructor(
    geneName: string,
    start: number,
    end: number,
    strand: number,
    gene_type: string,
    description: string = ""
  ) {
    super();
    this.geneName = geneName;
    this.start = start;
    this.end = end;
    this.strand = strand;
    this.type = gene_type;
    this.description = description;
  }
}

export class EdgeGene extends Gene {
  ortho_tag: string;

  constructor(start: number, end: number, strand: number, ortho_tag: string) {
    super("Edge", start, end, strand, "Edge", "");
    this.ortho_tag = ortho_tag;
  }
}

/**
 * Parse GFF files from a directory into a dictionary
 * @param gffDoc - Directory containing GFF files
 * @return A dictionary where keys are genome names and values are paths to GFF files
 * @example 
 * const gffDict = parseGFFDict('path/to/gff/files');
 * // gffDict will be an object like { 'genome1': 'path/to/genome1.gff', 'genome2': 'path/to/genome2.gff' }
 */
export function parseGFFDict(gffDoc: string): { [genomeName: string]: string } {
  const gffDict: { [genomeName: string]: string } = {};
  const files = fs.readdirSync(gffDoc);
  for (const file of files) {
    if (file.endsWith('.gff', '.gff3')) {
      const genomeName = file.split('.')[0]; // Extract genome name from the filename
      gffDict[genomeName] = `${gffDoc}/${file}`;
    }
  }
  return gffDict;
}

/**
 * Get the contig length(s) from a GFF file
 * @param inpath - Path to the input file containing contig lengths
 * @return A dictionary with contig IDs as keys and their lengths as values
 * @example
 * const contigLengths = getContigLengthDict('path/to/gff/file.gff');
 * // contigLengths will be an object like { 'contig1': 1000, 'contig2': 2000 }
 */
export function getContigLengthDict(inpath: string): { [id: string]: number } {
  const contigLengthDict: { [id: string]: number } = {};
  const lines = fs.readFileSync(inpath, 'utf8').split('\n');
  for (const line of lines) {
    if (line.startsWith('##sequence-region')) {
      const parts = line.split(/\s+/);
      if (parts.length >= 3) {
        const contigId = parts[1];
        const length = parseInt(parts[2], 10);
        contigLengthDict[contigId] = length;
      }
    }
  }
  return contigLengthDict;
}

/**
 * Create a JSON object from a GFF file (create_json_obj)
 * @param genomeName - The name of the genome
 * @param inpath - Path to the input GFF file
 * @return A JSON object representing the genome, contigs, and genes
 * @example
 * const genomeJson = gff2json('genome1', 'path/to/genome1.gff');
 * // genomeJson will be a JSON object structured with genome, contigs, and genes
 * @throws Will throw an error if the GFF file is not found or cannot be parsed
 */
export function gff2json(genomeName: string, inpath: string): Genome {
  if (!fs.existsSync(inpath)) {
    throw new Error(`GFF file not found: ${inpath}`);
  }

  const genome = new Genome(genomeName);
  const contigLengthDict = getContigLengthDict(inpath);
  const gffContent = fs.readFileSync(inpath, 'utf8');
  const features = gff.parseStringSync(gffContent);

  var contigs: { [contigName: string]: Contig } = {}; // Dictionary to hold contigs by name

  var repeatIdx = -1; // repeat counting logic. This assumes that repeats are adjacent to each other in the GFF file

  features.forEach((feature: any) => { // This GFF parser doesn't group features by contig, so we need to do it manually
    const contigName = feature[0].seq_id;
    // Check if the contig already exists, if not create it
    if (!contigs[contigName]) {
      contigs[contigName] = new Contig(contigName);
    }
    contigs[contigName].set_attr("contigLength", contigLengthDict[contigName] || 0); // Set contig length if available

    const geneType = feature[0].type;
    const start: number = feature[0].start;
    const end: number = feature[0].end;
    const strand: number = feature[0].strand;
    // Read the description for the gene
    const geneDesc: string[] = [`pos=${start}-${end}`];
    Object.entries(feature[0].attributes).forEach(([key, value]) => {
      if (!["source", "phase"].includes(key)) {
        if (Array.isArray(value)) { // TS wanted this
          geneDesc.push(`${key}=${value[0]}`);
        }
      }
    });
    // Name, create, and add the gene to the contig
    var geneName = feature[0].attributes.ID ? feature[0].attributes.ID[0] : `unknown_${start}_${end}`; // Fallback if ID is not present
    if (geneType === "repeat_region") {
      repeatIdx += 1; // Increment repeat index for repeat genes
      geneName = `${contigName}_repeat_${repeatIdx}`;
    } else {
      repeatIdx = -1; // Reset repeat index for non-repeat genes
    }
    const gene = new Gene(geneName, start, end, strand, geneType, geneDesc.join("<br>"));
    contigs[contigName].add_gene(gene); // Add gene to the contig
  });

  // Add all contigs to the genome
  Object.values(contigs).forEach((contig) => {
    genome.add_contig(contig);
  });

  return genome;
}

/**
 * Convert GFF files in a directory to a JSON object
 * @param gffDict - A dictionary where keys are genome names and values are paths to GFF files
 * @returns - A GenomeSet object containing all the genomes parsed from the GFF files
 * @example
 * const gffDict = { 'genome1': 'path/to/genome1.gff', 'genome2': 'path/to/genome2.gff' };
 * const genomes = createJSONObjBatch(gffDict);
 * // genomes will be a GenomeSet object containing all the parsed genomes
 */
export function createJSONObjBatch(gffDict: { [genomeName: string]: string }): GenomeSet {
  const genomes: GenomeSet = new GenomeSet([]);
  // Iterate over the gffDict to create JSON objects for each genome
  for (const [genomeName, inpath] of Object.entries(gffDict)) {
    const genome = gff2json(genomeName, inpath);
    genomes.push(genome);
  }
  return genomes;
}

/**
 * Convert GFF files in a directory to a JSON object. (gff_to_json)
 * @param gffDoc - Directory containing GFF files
 * @returns - A GenomeSet object containing all the genomes parsed from the GFF files
 * @example
 * const genomeSet = gffToJSON('path/to/gff/files');
 * // genomeSet will be a GenomeSet object containing all the parsed genomes
 */
export function parseGFFDirectoryToJSON(gffDoc: string): GenomeSet {
  const gffDict = parseGFFDict(gffDoc);
  return createJSONObjBatch(gffDict);
}

/**
 * Create a dictionary of ortho tags from a file. (get_ortho_tag_dict)
 * @param path - Path to the input file containing ortho tags
 * @returns - A dictionary where keys are gene names and values are ortho tags
 */
export function parseOrtho(path: string): { [key: string]: string } {
  const orthoTagDict: { [key: string]: string } = {};
  const lines = fs.readFileSync(path, 'utf8').split('\n');
  for (const line of lines) {
    if (line.trim() === "" || line.startsWith("#")) continue; // Skip empty lines and comments
    const parts = line.split(/\s+/);
    if (parts.length >= 2) {
      const geneName = parts[0];
      const orthoTag = parts[1];
      orthoTagDict[geneName] = orthoTag;
    }
  }
  return orthoTagDict;
}

/**
 * Add ortho tags to genes in a genome set. (add_ortho_tags)
 * @param genomeSet - A GenomeSet object containing genomes and their contigs
 * @param orthoFile - Path to the input file containing ortho tags
 */
export function addOrthoTags(genomeSet: GenomeSet, orthoFile: string): void {
  const orthoTagDict = parseOrtho(orthoFile);
  genomeSet.genomes.forEach((genome) => {
    genome.contigs.forEach((contig) => {
      contig.genes.forEach((gene) => {
        if (orthoTagDict[gene.geneName]) {
          gene.set_attr("ortho_tag", orthoTagDict[gene.geneName]);
        }
      });
    });
  });
}

/**
 * Create a dictionary of species names from a file. (get_speciesName_dict)
 * @param path - Path to the input file containing species information
 * @returns - A dictionary where keys are species names and values are their corresponding paths
 */
export function parseSpecies(path: string): { [key: string]: string } {
  const speciesDict: { [key: string]: string } = {};
  const lines = fs.readFile(path, 'utf8').split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    const [genomeName, taxonomy] = line.split('\t');
    const speciesName = taxonomy.split(';').pop()?.replace('s__', '') || '';
    speciesDict[genomeName] = speciesName;
  }

  return speciesDict;
}

/**
 * Add metadata (species info) to genomes in a genome set
 * @param genomeSet - A GenomeSet object containing genomes and their contigs
 * @param speciesFile - Path to the input file containing species information
 */
export function addMetaBatch(genomeSet: GenomeSet, speciesFile: string): void {
  const speciesDict = parseSpecies(speciesFile);
  genomeSet.genomes.forEach((genome) => {
    if (speciesDict[genome.genomeName]) {
      genome.set_attr("speciesName", speciesDict[genome.genomeName]);
    }
  });
}