import React, { useEffect, useState, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import jsonpath from 'jsonpath';
import OrthoPlot from './components/orthoplot';
import * as d3_save_svg from 'd3-save-svg';
import './App.css';
import { parseGFFContent } from './utils/utils';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Button from '@mui/material/Button';

function App() {
  const [flankSize, setFlankSize] = useState(5000);
  const [panelWidth, setPanelWidth] = useState(1000);
  const [panelHeight, setPanelHeight] = useState(20);
  const [genomeObjs, setGenomeObjs] = useState(null);
  const [orthos, setOrthos] = useState({});
  const [orthoOptions, setOrthoOptions] = useState([]);
  const [curOrthoID, setCurOrthoID] = useState('');
  const [preOrthoCol, setPreOrthoCol] = useState([]);
  const [displayClusters, setDisplayClusters] = useState([]); // New state to hold clusters
  const [contextMenu, setContextMenu] = useState({
    open: false,
    position: { x: 0, y: 0 },
    gene: null
  });
  const [newOrthoTag, setNewOrthoTag] = useState('');

  const clusterRef = useRef(null);
  const orthoIDRef = useRef(null);
  const divFloater = useRef(null);

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
    // window.onbeforeunload = () => {
    //   return "Data will be lost if you refresh the page, are you sure?";
    // };
  }, []);

  // Initialize the orthos options based on genomeObjs
  useEffect(() => {
    if (genomeObjs) {
      const options = jsonpath.query(genomeObjs, "$..orthoTag")
        .filter(Boolean)
        .filter((value, index, self) => self.indexOf(value) === index);
      setOrthoOptions(options);
    }
  }, [genomeObjs]);

  // Draw clusters when curOrthoID or genomeObjs change
  useEffect(() => {
    // Apply orthos to genomeObjs
    if (genomeObjs && curOrthoID) {
      drawClusters();
    }
  }, [genomeObjs, curOrthoID, orthos]);

  useEffect(() => {
    if (orthos && genomeObjs) {
      console.log("Applying orthos to genomeObjs...");
      genomeObjs.forEach(genome => {
        genome.contigs.forEach(contig => {
          contig.genes.forEach(gene => {
            if (orthos[gene.geneName]) {
              gene.orthoTag = orthos[gene.geneName];
            }
          });
        });
      });
    }
  }, [orthos]);

  useEffect(() => {
    if (genomeObjs && curOrthoID) {
      drawClusters();
    }
  }, [flankSize, panelHeight, panelWidth]);

  const handleCloseMenu = () => {
    setContextMenu(prev => ({ ...prev, open: false }));
    setNewOrthoTag('');
  };

  const handleAddOrthoTag = () => {
    if (!contextMenu.gene || !newOrthoTag) return;

    const updatedGenomeObjs = [...genomeObjs];
    // Update the orthoTag in all matching genes
    updatedGenomeObjs.forEach(genome => {
      genome.contigs.forEach(contig => {
        contig.genes.forEach(gene => {
          if (gene.geneName === contextMenu.gene.geneName) {
            gene.orthoTag = newOrthoTag;
          }
        });
      });
    });

    setGenomeObjs(updatedGenomeObjs);
    setCurOrthoID(newOrthoTag);
    handleCloseMenu();
    drawClusters();
  };

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

  // Creates colored clusters based on the query orthoID (centering), and flankSize
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
    setDisplayClusters(clusters); // New state to hold clusters
  };

  const handleSubmit = (e, newValue) => {
    e?.preventDefault(); // Make preventDefault optional
    if (!newValue) {
      alert("Empty value");
      return;
    }
    setCurOrthoID(newValue);
    drawClusters();
  };

  const handleSliderChange = (setter) => (event) => {
    const value = parseInt(event.target.value);
    setter(value);
    drawClusters();
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
    const genomes = [];
    gffFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const gffData = e.target.result;
        const genome = parseGFFContent(file.name.split('.')[0], gffData);
        genomes.push(genome);
      };
      reader.readAsText(file);
    });
    setGenomeObjs(genomes);
  };

  const handleTxtFileChange = (event) => {
    const file = event.target.files[0];
    if (!file || !file.name.endsWith('.txt')) {
      alert('Please select a .txt file');
      return;
    }
    // Read file and set orthoTag dictionary
    const reader = new FileReader();
    reader.onload = (e) => {
      const lines = e.target.result.split('\n');
      const orthoTagDict = {};
      for (const line of lines) {
        if (line.trim() === "" || line.startsWith("#")) continue; // Skip empty lines and comments
        const parts = line.split(/\s+/);
        if (parts.length >= 2) {
          const geneName = parts[0];
          const orthoTag = parts[1];
          orthoTagDict[geneName] = orthoTag;
        }
      }
      setOrthos(orthoTagDict);
    }

    reader.readAsText(file);
  };

  const dblclickedOn = (event, data) => {
    setContextMenu({
      open: true,
      position: { x: event.pageX, y: event.pageY },
      gene: data
    });
  }

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'row', marginTop: '1em' }}>
        <div id="cluster" ref={clusterRef} style={{ flexGrow: 1 }}>
          <OrthoPlot
            id="orthoplot"
            clusters={displayClusters}
            height={panelHeight}
            width={panelWidth}
            dblclickedOn={dblclickedOn}
          />
        </div>
        <div className="div-floater" ref={divFloater}>
          <form onSubmit={(e) => e.preventDefault()}>
            <Autocomplete
              value={curOrthoID}
              onChange={(event, newValue) => handleSubmit(event, newValue)}
              options={orthoOptions}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Enter orthoID"
                  variant="outlined"
                  size="small"
                  fullWidth
                />
              )}
              sx={{ mb: 2 }}
            />
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
            <label htmlFor="txtFile">Orthos File: </label>
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
      </div>
      <Menu
        open={contextMenu.open}
        onClose={handleCloseMenu}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu.open
            ? { top: contextMenu.position.y, left: contextMenu.position.x }
            : undefined
        }
      >
        <MenuItem>
          <div style={{ padding: '8px' }}>
            <TextField
              label="New Ortho Tag"
              value={newOrthoTag}
              onChange={(e) => setNewOrthoTag(e.target.value)}
              size="small"
              fullWidth
              sx={{ mb: 1 }}
            />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <Button
                size="small"
                onClick={handleCloseMenu}
              >
                Cancel
              </Button>
              <Button
                variant="contained"
                size="small"
                onClick={handleAddOrthoTag}
                disabled={!newOrthoTag}
              >
                Add & Center
              </Button>
            </div>
          </div>
        </MenuItem>
        {contextMenu.gene?.orthoTag && (
          <MenuItem onClick={() => {
            setCurOrthoID(contextMenu.gene.orthoTag);
            handleCloseMenu();
            drawClusters();
          }}>
            Center on this OrthoID
          </MenuItem>
        )}
      </Menu>
    </>
  );
}

export default App;