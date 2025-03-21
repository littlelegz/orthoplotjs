import React, { useEffect, useState, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import jsonpath from 'jsonpath';
import OrthoPlot from './components/orthoplot';
import * as d3_save_svg from 'd3-save-svg';
import './App.css';
import { parseGFFContent } from './utils/utils';

function App() {
  const [flankSize, setFlankSize] = useState(5000);
  const [panelWidth, setPanelWidth] = useState(1000);
  const [panelHeight, setPanelHeight] = useState(20);
  const [genomeObjs, setGenomeObjs] = useState(null);
  const [curOrthoID, setCurOrthoID] = useState('');
  const [preOrthoCol, setPreOrthoCol] = useState([]);
  const [displayClusters, setDisplayClusters] = useState([]); // New state to hold clusters

  const clusterRef = useRef(null);
  const orthoIDRef = useRef(null);
  const orthoplotRef = useRef(null);

  // Load JSON and initialize state
  useEffect(() => {
    // Load JSON data
    fetch('data.json')
      .then(response => response.json())
      .then(data => {
        setGenomeObjs(data);
        const tmpQuery = jsonpath.query(data, "$..orthoTag");
        setCurOrthoID(tmpQuery[0]);
      });

    // Warn on page refresh
    window.onbeforeunload = () => {
      return "Data will be lost if you refresh the page, are you sure?";
    };
  }, []);

  useEffect(() => {
    if (genomeObjs && curOrthoID) {
      drawClusters();
      initEventHandlers();
    }
  }, [genomeObjs, curOrthoID]);

  useEffect(() => {
    if (genomeObjs && curOrthoID) {
      drawClusters();
    }
  }, [flankSize, panelHeight, panelWidth]);

  const aroundOrtho = (queryOrthoID, flankSize) => {
    if (!genomeObjs) return [];
    return genomeObjs.map(function (genome) {

      let genomeName = genome.genomeName;
      let speciesName = genome.speciesName;

      return genome.contigs.map(function (contig) {
        let contigName = contig.contigName;
        let contigLength = contig.contigLength;
        let centerAround = function (centerGene) {
          let centerPos = Math.floor(0.5 * (centerGene.start + centerGene.end));
          if (centerGene.strand == -1) {
            return {
              start: -centerPos - flankSize,
              end: -centerPos + flankSize,
              idx: genomeName,
              label: genomeName + ":" + contigName + "(-)" + " " + speciesName,
              contigLength: contigLength,
              genes: contig.genes
                .filter((gene) => {
                  return (-gene.start >= -centerPos - flankSize) && (-gene.end <= -centerPos + flankSize)
                })
                .map((gene) => {
                  return {
                    geneName: gene.geneName,
                    start: -gene.end,
                    end: -gene.start,
                    strand: gene.strand * (-1),
                    orthoTag: gene.orthoTag,
                    description: gene.description,
                    type: gene.type
                  }
                })
            }
          } else {
            return {
              start: centerPos - flankSize,
              end: centerPos + flankSize,
              idx: genomeName,
              label: genomeName + ":" + contigName + "(+)" + " " + speciesName,
              contigLength: contigLength,
              genes: contig.genes
                .filter((gene) => {
                  return (gene.end >= centerPos - flankSize) && (gene.start <= centerPos + flankSize)
                })
                .map((gene) => {
                  return {
                    geneName: gene.geneName,
                    start: gene.start,
                    end: gene.end,
                    strand: gene.strand,
                    orthoTag: gene.orthoTag,
                    description: gene.description,
                    type: gene.type,
                  }
                })
            }
          }
        };

        let output = contig.genes.filter((x) => {
          return x.orthoTag == queryOrthoID
        }).map(centerAround);

        return output;
      });
    }).flat(2)
  };

  const colorOrtho = (prevOrthoCol, curOrtho) => {
    let intersection = prevOrthoCol.filter(x => x.color != "#FFFFFF").filter(x => curOrtho.includes(x.orthoTag)),
      colorLeft = d3.schemeSet3.filter(x => !intersection.map(t => t.color).includes(x)),
      orthoLeft = curOrtho.filter(x => !intersection.map(t => t.orthoTag).includes(x));
    return orthoLeft.map(function (e, i) {
      return [{
        orthoTag: e,
        color: colorLeft[i]
      }];
    }).flat().filter(x => x.color).concat(intersection);
  };

  const colorCluster = useCallback((queryOrthoID, flankSize) => {
    const clusters = aroundOrtho(queryOrthoID, flankSize);
    const orthoTags = jsonpath.query(clusters, "$..orthoTag");

    // Create frequency map for sorting
    const frequencyMap = orthoTags.reduce((acc, tag) => {
      if (!tag) return acc;
      acc[tag] = (acc[tag] || 0) + 1;
      return acc;
    }, {});



    // Sort by frequency
    const curOrtho = [...new Set(orthoTags)]
      .filter(Boolean)
      .sort((a, b) => frequencyMap[b] - frequencyMap[a]);

    // Update colors using state setter
    const newPreOrthoCol = colorOrtho(preOrthoCol, curOrtho);
    setPreOrthoCol(newPreOrthoCol);

    // Update cluster colors
    clusters.forEach(cluster => {
      cluster.genes.forEach(gene => {
        const colorInfo = newPreOrthoCol.find(x => x.orthoTag === gene.orthoTag);
        gene.color = colorInfo ? colorInfo.color : "#FFFFFF";
      });
    });

    return clusters;
  }, [preOrthoCol]);

  const drawClusters = () => {
    const clusters = colorCluster(curOrthoID, flankSize);
    if (clusters) {
      setDisplayClusters(clusters); // New state to hold clusters
    }
  };

  const handleRefresh = (event) => {
    d3.selectAll(".tooltip").remove();
    const val = event.target.getAttribute("name");
    if (!val) return;

    const regionName = event.target.parentElement.parentElement.id;
    setCurOrthoID(val);
    orthoplotRef.current?.drawClusters(regionName, colorCluster(val, flankSize), panelHeight, panelWidth);
    initEventHandlers();
  };

  const initEventHandlers = () => {
    const cdsElements = document.querySelectorAll(".orthoplot-type-CDS");
    cdsElements.forEach(element => {
      element.addEventListener('dblclick', handleRefresh);
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const tmpOrthoID = orthoIDRef.current.value;
    if (!tmpOrthoID) {
      alert("Empty value");
      return;
    }
    if (!jsonpath.query(genomeObjs, "$..orthoTag").includes(tmpOrthoID)) {
      alert(`Cannot find ${tmpOrthoID} in the genomes`);
      return;
    }
    setCurOrthoID(tmpOrthoID);
    drawClusters();
    initEventHandlers();
  };

  const handleSliderChange = (setter) => (event) => {
    const value = parseInt(event.target.value);
    setter(value);
    drawClusters();
    initEventHandlers();
  };

  const handleDownload = () => {
    const config = {
      filename: `GeneNeighborhood_${Date.now()}`
    };
    d3_save_svg.save(d3.select('svg').node(), config);
  };

  const handleGffDirectoryChange = (event) => {
    const files = Array.from(event.target.files);
    const gffFiles = files.filter(file =>
      file.name.endsWith('.gff') || file.name.endsWith('.gff3')
    );
    if (gffFiles.length === 0) {
      alert('No .gff or .gff3 files found');
      return;
    }
    // Process GFF files...
    gffFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const gffData = e.target.result;
        const genomeObj = parseGFFContent(file.name, gffData);
        console.log(`Parsed GFF file: ${file.name}`, genomeObj);
      };
      reader.readAsText(file);
    }
    );
  };

  const handleTxtFileChange = (event) => {
    const file = event.target.files[0];
    if (!file || !file.name.endsWith('.txt')) {
      alert('Please select a .txt file');
      return;
    }
    // Process TXT file...
  };

  return (
    <>
      <div id="cluster" ref={clusterRef} style={{ position: 'absolute', left: 20, top: 20 }}>
        <OrthoPlot
          id="orthoplot"
          clusters={displayClusters}
          height={panelHeight}
          width={panelWidth}
        />
      </div>
      <div className="div-floater">
        <form onSubmit={handleSubmit}>
          <p>
            Enter orthoID
            <input
              type="text"
              ref={orthoIDRef}
              onFocus={(e) => e.target.value = ''}
            />
            <input type="submit" value="Go" />
          </p>
        </form>
        <hr />
        <div>
          <label htmlFor="panelWidth">Panel Width: {panelWidth}</label>
          <input
            type="range"
            id="panelWidth"
            min="100"
            max="2000"
            value={panelWidth}
            onChange={handleSliderChange(setPanelWidth)}
          />
        </div>
        <div>
          <label htmlFor="panelHeight">Panel Height: {panelHeight}</label>
          <input
            type="range"
            id="panelHeight"
            min="5"
            max="100"
            value={panelHeight}
            onChange={handleSliderChange(setPanelHeight)}
          />
        </div>
        <div>
          <label htmlFor="flankSize">Flanking region Size (bp): {flankSize}</label>
          <input
            type="range"
            id="flankSize"
            min="1000"
            max="100000"
            value={flankSize}
            onChange={handleSliderChange(setFlankSize)}
          />
        </div>
        <hr />
        <div>
          <label htmlFor="gffDirectory">GFF Directory: </label>
          <input
            type="file"
            id="gffDirectory"
            webkitdirectory="true"
            directory="true"
            multiple
            onChange={handleGffDirectoryChange}
            accept=".gff,.gff3"
          />
        </div>
        <div>
          <label htmlFor="txtFile">Species File: </label>
          <input
            type="file"
            id="txtFile"
            onChange={handleTxtFileChange}
            accept=".txt"
          />
        </div>
        <hr />
        <button
          className="btn btn-primary"
          onClick={handleDownload}
        >
          <i className="fa fa-download" /> Download SVG
        </button>
      </div>
    </>
  );
}

export default App;