import { parseStringSync } from 'gff-nostream'

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

    addContig(contig: Contig): void {
        this.contigs.push(contig);
    }

    to_dict(): { [key: string]: any } {
        const orderedDict: { [key: string]: any } = {
            genomeName: this.genomeName,
            contigs: this.contigs
        };

        // Add any additional attributes set via set_attr
        Object.keys(this).forEach(key => {
            if (key !== 'genomeName' && key !== 'contigs') {
                orderedDict[key] = this[key];
            }
        });

        return orderedDict;
    }
}

export class GenomeSet extends BaseObject {
    genomes: Genome[] = [];

    constructor(genomes: Genome[]) {
        super();
        this.genomes = genomes;
    }

    addGenome(genome: Genome): void {
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

    addGene(gene: Gene): void {
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
    orthoTag: string;

    constructor(start: number, end: number, strand: number, orthoTag: string) {
        super("Edge", start, end, strand, "Edge", "");
        this.orthoTag = orthoTag;
    }
}

/**
 * Create a JSON object from GFF content string
 * @param genomeName - The name of the genome
 * @param gffContent - String content of the GFF file
 * @return A JSON object representing the genome, contigs, and genes
 * @example
 * const content = '##sequence-region   contig1 1 1000\n...';
 * const genomeJson = parseGFFContent('genome1', content);
 */
export function parseGFFContent(genomeName: string, gffContent: string): Genome {
    const genome = new Genome(genomeName);

    // Get contig lengths from the content
    const contigLengthDict: { [id: string]: number } = {};
    const lines = gffContent.split('\n');
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

    const features = parseStringSync(gffContent);
    var contigs: { [contigName: string]: Contig } = {};
    var repeatIdx = -1;

    features.forEach((feature: any) => {
        const contigName = feature[0].seq_id;
        if (!contigs[contigName]) {
            contigs[contigName] = new Contig(contigName);
        }
        contigs[contigName].set_attr("contigLength", contigLengthDict[contigName] || 0);

        const geneType = feature[0].type;
        const start: number = feature[0].start;
        const end: number = feature[0].end;
        const strand: number = feature[0].strand;

        const geneDesc: string[] = [`pos=${start}-${end}`];
        Object.entries(feature[0].attributes).forEach(([key, value]) => {
            if (!["source", "phase"].includes(key)) {
                if (Array.isArray(value)) {
                    geneDesc.push(`${key}=${value[0]}`);
                }
            }
        });

        var geneName = feature[0].attributes.ID ? feature[0].attributes.ID[0] : `unknown_${start}_${end}`;
        if (geneType === "repeat_region") {
            repeatIdx += 1;
            geneName = `${contigName}_repeat_${repeatIdx}`;
        } else {
            repeatIdx = -1;
        }

        const gene = new Gene(geneName, start, end, strand, geneType, geneDesc.join("<br>"));
        contigs[contigName].addGene(gene);
    });

    Object.values(contigs).forEach((contig) => {
        genome.addContig(contig);
    });

    return genome;
}