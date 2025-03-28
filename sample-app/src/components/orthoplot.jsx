import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

const OrthoPlot = ({ id, clusters, height, width = 1000, dblclickedOn }) => {
  const svgRef = useRef(null);
  const labelHeight = 12;
  const uniqueId = useRef(0);
  const [tooltip, setTooltip] = useState({
    show: false,
    content: '',
    x: 0,
    y: 0
  });
  const [displayCount, setDisplayCount] = useState(10);
  const tooltipRef = useRef(null);
  const [currentPage, setCurrentPage] = useState(0);

  const geneArrowPoints = (orf, height, offset, space, scale) => {
    let cap = offset + labelHeight + space;
    let bottom = offset + labelHeight + height - space;

    let start = scale(orf.start);
    let end = scale(orf.end);

    let middle = (cap + bottom) / 2;

    let box_end = Math.max(scale(orf.end) - (2 * space), start);
    let box_start = Math.min(scale(orf.start) + (2 * space), end);

    if (orf.strand == 1) {
      let points = "" + start + "," + cap;
      points += " " + box_end + "," + cap;
      points += " " + end + "," + middle;
      points += " " + box_end + "," + bottom;
      points += " " + start + "," + bottom;
      return points;
    }
    if (orf.strand == -1) {
      let points = "" + start + "," + middle;
      points += " " + box_start + "," + cap;
      points += " " + end + "," + cap;
      points += " " + end + "," + bottom;
      points += " " + box_start + "," + bottom;
      return points;
    }
    if (orf.strand == 0) {
      let points = "" + start + "," + cap;
      points += " " + end + "," + cap;
      points += " " + end + "," + bottom;
      points += " " + start + "," + bottom;
      return points;
    }
  };

  const rnaTrianglePoints = (orf, height, offset, space, scale) => {
    let cap = offset + labelHeight + space;
    let bottom = offset + labelHeight + height - space;

    let start = scale(orf.start);
    let end = scale(orf.end);

    let center = (start + end) / 2;

    let points = "" + start + "," + bottom;
    points += " " + center + "," + cap;
    points += " " + end + "," + bottom;
    points += " " + start + "," + bottom;
    return points;
  }

  const repeatDiamondPoints = (orf, height, offset, space, scale) => {
    let cap = offset + labelHeight + space;
    let bottom = offset + labelHeight + height - space;

    let start = scale(orf.start);
    let end = scale(orf.end);

    let center = (start + end) / 2;
    let middle = (cap + bottom) / 2;

    let points = "" + start + "," + middle;
    points += " " + center + "," + cap;
    points += " " + end + "," + middle;
    points += " " + center + "," + bottom;
    points += " " + start + "," + middle;
    return points;
  }

  const drawOrderedClusterOrfs = (cluster, chart, allOrfs, allRepeats, allRnas,
    scale, i, idx, height, width, singleClusterHeight, space) => {
    // Draw the line representing the edge of the contigs
    let contigLength = cluster.contigLength;
    let start_pos = scale(0);
    let rev = cluster.start + cluster.end > 0 ? 1 : -1; // check to see if we need to use minus strand to scale the data
    let end_pos = Number(scale(contigLength * rev));

    let drawOrfByType = function (geneType, drawShapeFun, inputData) {
      chart.selectAll("polygon.orthoplot-gene-" + geneType)
        .data(inputData)
        .enter().append("polygon")
        .attr("points", function (d) {
          return drawShapeFun(d, height, (singleClusterHeight * i), space, scale)
        })
        .attr("class", function (d) {
          return "orthoplot-type-" + d.type + " orthoplot-gene-" + geneType + " orthoplot-gene";
        })
        .attr("id", function (d) {
          return idx + "-cluster" + cluster.idx + "-" + tagToId(d.geneName) + "-orf";
        })
        .attr("name", function (d) {
          return d.orthoTag ? d.orthoTag : null;
        })
        .attr("style", function (d) {
          if (d.color !== undefined && d.type == "CDS") {
            return "fill:" + d.color;
          }
        })
        .on("mouseover", function (event, d) {
          const orthoTag = d.orthoTag;
          const content = (orthoTag ? "orthoTag=" + orthoTag + "<br>" : "") + d.description;
          setTooltip({
            show: true,
            content,
            x: event.pageX + 10,
            y: event.pageY - 10
          });
          tooltipRef.current.innerHTML = content; // Update tooltip content
        })
        .on("mouseout", () => {
          setTooltip(prev => ({ ...prev, show: false }));
        })
        .on("dblclick", function (event, d) {
          const clickedData = d3.select(event.target).datum();
          dblclickedOn(event, clickedData);
        });
    }

    chart.append("line")
      .attr("x1", Math.min(width, Math.max(start_pos, 0)))
      .attr("y1", (singleClusterHeight * i) + labelHeight + (height / 2))
      .attr("x2", Math.max(0, Math.min(width, end_pos)))
      .attr("y2", (singleClusterHeight * i) + labelHeight + (height / 2))
      .attr("class", "orthoplot-line")

    drawOrfByType("CDS", geneArrowPoints, allOrfs);

    drawOrfByType("RNA", rnaTrianglePoints, allRnas);

    drawOrfByType("repeat", repeatDiamondPoints, allRepeats);

  };

  const drawClusters = () => {
    if (!clusters) return;

    const startIdx = currentPage * displayCount;
    const endIdx = startIdx + displayCount;
    const visibleClusters = clusters.slice(startIdx, endIdx);

    const container = d3.select(svgRef.current);
    const singleClusterHeight = height + (2 * labelHeight);

    container.selectAll("*").remove();

    const chart = container
      .attr("height", singleClusterHeight * visibleClusters.length)
      .attr("width", width);

    const allOrfs = [];
    const allRnas = [];
    const allRepeats = [];

    visibleClusters.forEach((cluster, i) => {
      allOrfs.push(...cluster.genes.filter(n => n.type === "CDS"));
      allRnas.push(...cluster.genes.filter(n => n.type.match(/RNA/)));
      allRepeats.push(...cluster.genes.filter(n => n.type.match(/repeat/)));

      const idx = uniqueId.current++;
      const space = height / 10;

      const x = d3.scaleLinear()
        .domain([cluster.start, cluster.end])
        .range([0, width]);

      drawOrderedClusterOrfs(cluster, chart, allOrfs, allRepeats, allRnas,
        x, i, idx, height, width, singleClusterHeight, space);

      if (cluster.label) {
        chart.append("text")
          .text(cluster.label)
          .attr("class", "orthoplot-clusterlabel")
          .attr("x", function () {
            return width - this.getComputedTextLength() - 5;
          })
          .attr("y", () => (singleClusterHeight * i) + labelHeight)
          .attr("font-size", labelHeight);
      }
    });
  };

  const tagToId = (tag) => {
    return tag.replace(/(:|\.)/g, '-').replace(/-orf/g, '_orf');
  }

  useEffect(() => {
    drawClusters();
  }, [clusters, height, width, displayCount, currentPage]);

  // Add pagination controls
  const renderPaginationControls = () => {
    if (clusters?.length <= 10) return null;

    const totalPages = Math.ceil(clusters.length / displayCount);
    const hasNextPage = (currentPage + 1) * displayCount < clusters.length;
    const hasPrevPage = currentPage > 0;

    return (
      <div style={{ textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
        <button
          onClick={() => setCurrentPage(currentPage - 1)}
          disabled={!hasPrevPage}
          style={{ opacity: hasPrevPage ? 1 : 0.5 }}
        >
          ←
        </button>

        <button
          onClick={() => {setDisplayCount(10); setCurrentPage(0)}}
          style={{
            fontWeight: displayCount === 10 ? 'bold' : 'normal',
            margin: '0 5px'
          }}
        >
          Show 10
        </button>
        <button
          onClick={() => {setDisplayCount(20); setCurrentPage(0)}}
          style={{
            fontWeight: displayCount === 20 ? 'bold' : 'normal',
            margin: '0 5px'
          }}
        >
          Show 20
        </button>
        {clusters.length > 20 && (
          <button
            onClick={() => {setDisplayCount(50); setCurrentPage(0)}}
            style={{
              fontWeight: displayCount === 50 ? 'bold' : 'normal',
              margin: '0 5px'
            }}
          >
            Show 50
          </button>
        )}

        <button
          onClick={() => setCurrentPage(currentPage + 1)}
          disabled={!hasNextPage}
          style={{ opacity: hasNextPage ? 1 : 0.5 }}
        >
          →
        </button>

        <span style={{ marginLeft: '10px' }}>
          Page {currentPage + 1} of {totalPages}
        </span>
      </div>
    );
  };

  return (
    <>
      {renderPaginationControls()}
      <div id={id} style={{ overflow: 'hidden', border: '1px solid #ccc', height: 'fit-content', userSelect: 'none' }}>
        <svg ref={svgRef} />
      </div>
      <div
        className="tooltip"
        style={{
          position: 'fixed',
          left: tooltip.x,
          top: tooltip.y,
          opacity: tooltip.show ? 0.9 : 0,
          pointerEvents: 'none',
          backgroundColor: 'lightgray',
          border: '1px solid #ccc',
          padding: '5px',
          borderRadius: '4px',
          boxShadow: '2px 2px 4px rgba(0,0,0,0.1)',
          display: tooltip.show ? 'block' : 'none'
        }}
        ref={tooltipRef}
      />
    </>
  );
};

export default OrthoPlot;