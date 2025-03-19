import React, { useEffect, useState, useRef } from 'react';
import * as d3 from 'd3';
import jsonpath from 'jsonpath';
import { saveSvg } from 'd3-save-svg';
import './App.css';

function App() {
  const [flankSize, setFlankSize] = useState(5000);
  const [panelWidth, setPanelWidth] = useState(1000);
  const [panelHeight, setPanelHeight] = useState(20);
  const [genomeObjs, setGenomeObjs] = useState(null);
  const [curOrthoID, setCurOrthoID] = useState('');
  const [preOrthoCol, setPreOrthoCol] = useState([]);

  const clusterRef = useRef(null);
  const orthoIDRef = useRef(null);

  useEffect(() => {
    // Load JSON data
    fetch('data.json')
      .then(response => response.text())
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
    let intersection = preOrthoCol.filter(x => x.color != "#FFFFFF").filter(x => curOrtho.includes(x.orthoTag)),
      colorLeft = d3.schemeSet3.filter(x => !intersection.map(t => t.color).includes(x)),
      orthoLeft = curOrtho.filter(x => !intersection.map(t => t.orthoTag).includes(x));
    return orthoLeft.map(function (e, i) {
      return [{
        orthoTag: e,
        color: colorLeft[i]
      }];
    }).flat().filter(x => x.color).concat(intersection);
  };

  const colorCluster = (queryOrthoID, flankSize) => {
    let clusters = aroundOrtho(queryOrthoID, flankSize)
    let curOrtho = jsonpath.query(clusters, "$..orthoTag").byCount();
    preOrthoCol = colorOrtho(preOrthoCol, curOrtho);
    clusters.map(function (e) {
      e.genes.map(function (gene) {
        gene.color = preOrthoCol.filter(x => x.orthoTag == gene.orthoTag).length > 0 ? preOrthoCol.filter(x => x.orthoTag == gene.orthoTag)[0].color : "#FFFFFF";
      })
    });
    return clusters;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const tmpOrthoID = orthoIDRef.current.value;
    if (!tmpOrthoID) {
      alert("Empty value");
      return;
    }
    if (!jsonpath.query(genomeObjs, "$..orthoTag").includes(tmpOrthoID)) {
      alert(`Can not found ${tmpOrthoID} in the genomes`);
      return;
    }
    setCurOrthoID(tmpOrthoID);
    // Redraw clusters...
  };

  const handleDownload = () => {
    const config = {
      filename: `GeneNeighborhood_${Date.now()}`
    };
    saveSvg(d3.select('svg').node(), config);
  };

  return (
    <>
      <div id="cluster" ref={clusterRef} style={{ position: 'absolute', left: 20, top: 20 }} />
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
            onChange={(e) => setPanelWidth(parseInt(e.target.value))}
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
            onChange={(e) => setPanelHeight(parseInt(e.target.value))}
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
            onChange={(e) => setFlankSize(parseInt(e.target.value))}
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