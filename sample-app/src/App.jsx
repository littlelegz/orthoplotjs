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
import { MuiColorInput } from 'mui-color-input'
import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong';
import FormatColorResetIcon from '@mui/icons-material/FormatColorReset';

function App() {
  const [flankSize, setFlankSize] = useState(5000);
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
  const divFloater = useRef(null);

  // Initialize the orthos options based on genomeObjs
  useEffect(() => {
    if (genomeObjs) {
      const options = [...new Set(
        jsonpath.query(genomeObjs, "$..ortho_tag").filter(Boolean)
      )];
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
      genomeObjs.forEach(genome => {
        genome.contigs.forEach(contig => {
          contig.genes.forEach(gene => {
            if (orthos[gene.geneName]) {
              gene.ortho_tag = orthos[gene.geneName];
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
  }, [flankSize, panelHeight]);

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
            gene.ortho_tag = newOrthoTag;
          }
        });
      });
    });

    setGenomeObjs(updatedGenomeObjs);
    setCurOrthoID(newOrthoTag);
    handleCloseMenu();
    drawClusters();
  };

  const handleColorChange = (newColor) => {
    if (!contextMenu.gene?.ortho_tag) return;

    setPreOrthoCol(prev => {
      const updated = prev.map(item => {
        if (item.ortho_tag === contextMenu.gene.ortho_tag) {
          return { ...item, color: newColor };
        }
        return item;
      });
      return updated;
    });

    // Update the clusters with new color
    setDisplayClusters(prev => {
      return prev.map(cluster => ({
        ...cluster,
        genes: cluster.genes.map(gene => {
          if (gene.ortho_tag === contextMenu.gene.ortho_tag) {
            return { ...gene, color: newColor };
          }
          return gene;
        })
      }));
    });
  };

  const aroundOrtho = (queryOrthoID, flankSize) => {
    if (!genomeObjs) {
      return [];
    }
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
                    ortho_tag: gene.ortho_tag,
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
                    ortho_tag: gene.ortho_tag,
                    description: gene.description,
                    type: gene.type,
                  }
                })
            }
          }
        };

        let output = contig.genes.filter((x) => {
          return x.ortho_tag == queryOrthoID
        }).map(centerAround);

        return output;
      });
    }).flat(2)
  };

  const colorOrtho = (prevOrthoCol, curOrtho) => {
    const intersection = prevOrthoCol
      .filter(x => curOrtho.includes(x.ortho_tag));

    // Find orthos that need new colors
    const orthoLeft = curOrtho.filter(x =>
      !intersection.map(t => t.ortho_tag).includes(x)
    );

    // Get available colors from d3 schemes
    const baseColors = [
      ...d3.schemeSet3,
      ...d3.schemeSet2,
      ...d3.schemePaired,
      ...d3.schemeTableau10
    ];

    // Filter out already used colors
    const usedColors = intersection.map(t => t.color);
    let colorLeft = baseColors.filter(x => !usedColors.includes(x));

    // Generate additional colors if needed
    while (colorLeft.length < orthoLeft.length) {
      const newColor = d3.rgb(
        Math.random() * 255,
        Math.random() * 255,
        Math.random() * 255
      ).formatHex();
      if (!colorLeft.includes(newColor) && !usedColors.includes(newColor)) {
        colorLeft.push(newColor);
      }
    }

    // Create new color assignments
    const newAssignments = orthoLeft.map((e, i) => ({
      ortho_tag: e,
      color: colorLeft[i]
    }));

    return [...newAssignments, ...intersection];
  };

  // Creates colored clusters based on the query orthoID (centering), and flankSize
  const colorCluster = (queryOrthoID, flankSize) => {
    const clusters = aroundOrtho(queryOrthoID, flankSize);
    const orthoTags = jsonpath.query(clusters, "$..ortho_tag");

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
        const colorInfo = newPreOrthoCol.find(x => x.ortho_tag === gene.ortho_tag);
        gene.color = colorInfo ? colorInfo.color : "#FFFFFF";
      });
    });

    return clusters;
  };

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

  // Add this new handler function after the other handler functions:
  const handleJsonFileChange = (event) => {
    const file = event.target.files[0];
    if (!file || !file.name.endsWith('.json')) {
      alert('Please select a .json file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const jsonData = JSON.parse(e.target.result);

        // Print first 5 contigs for debugging
        if (jsonData[0] && jsonData[0].contigs) {
          console.log('First 5 contigs:',
            jsonData[0].contigs
              .slice(0, 5)
              .map(contig => ({
                name: contig.contigName,
                length: contig.contigLength,
                geneCount: contig.genes?.length || 0
              }))
          );
        }

        setGenomeObjs(jsonData);
        const tmpQuery = jsonpath.query(jsonData, "$..ortho_tag");
        setCurOrthoID(tmpQuery[0]);
      } catch (error) {
        alert('Invalid JSON file format');
        console.error('Error parsing JSON:', error);
      }
    };
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
            dblclickedOn={dblclickedOn}
          />
        </div>
        <div className="div-floater" ref={divFloater}>
          <form onSubmit={(e) => e.preventDefault()}>
            <Autocomplete
              value={curOrthoID || ''}
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
          <div>
            <label htmlFor="jsonFile">JSON File: </label>
            <input
              type="file"
              id="jsonFile"
              onChange={handleJsonFileChange}
              accept=".json"
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
              <Button size="small" onClick={handleCloseMenu}>
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
        {contextMenu.gene?.ortho_tag && (
          <div>
            <MenuItem>
              <div style={{ padding: '8px', width: '200px' }}>
                <p style={{ margin: '0 0 8px 0' }}>Change Color</p>
                <MuiColorInput
                  format="hex"
                  value={preOrthoCol.find(x =>
                    x.ortho_tag === contextMenu.gene?.ortho_tag
                  )?.color || '#FFFFFF'}
                  onChange={handleColorChange}
                />
              </div>
            </MenuItem>

            <MenuItem
              onClick={() => handleColorChange('#FFFFFF')}
              sx={{
                minHeight: '36px',
                display: 'flex',
                alignItems: 'center',
                gap: 1
              }}
            >
              <FormatColorResetIcon fontSize="small" />
              <span>Clear Color</span>
            </MenuItem>

            <MenuItem
              onClick={() => {
                setCurOrthoID(contextMenu.gene.ortho_tag);
                handleCloseMenu();
                drawClusters();
              }}
              sx={{
                minHeight: '36px',
                display: 'flex',
                alignItems: 'center',
                gap: 1
              }}
            >
              <CenterFocusStrongIcon fontSize="small" />
              <span>Center</span>
            </MenuItem>

          </div>
        )}
      </Menu>
    </>
  );
}

export default App;