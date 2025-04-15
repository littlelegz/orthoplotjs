import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import './orthoplot.css';

const OrthoPlot = ({ id, clusters, height, dblclickedOn }) => {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(0);
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
  const [pageInput, setPageInput] = useState('');

  // Add resize observer to track container width
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

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
          return d.ortho_tag ? d.ortho_tag : null;
        })
        .attr("style", function (d) {
          if (d.color !== undefined && d.type == "CDS") {
            return "fill:" + d.color;
          }
        })
        .on("mouseover", function (event, d) {
          const orthoTag = d.ortho_tag;
          const content = (orthoTag ? "ortho_tag=" + orthoTag + "<br>" : "") + d.description;
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
      .attr("width", "100%") // Set width to 100%
      .attr("preserveAspectRatio", "xMinYMin meet")
      .attr("viewBox", `0 0 ${containerWidth} ${singleClusterHeight * visibleClusters.length}`);

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
        .range([0, containerWidth]);

      drawOrderedClusterOrfs(cluster, chart, allOrfs, allRepeats, allRnas,
        x, i, idx, height, containerWidth, singleClusterHeight, space);

      if (cluster.label) {
        chart.append("text")
          .text(cluster.label)
          .attr("class", "orthoplot-clusterlabel")
          .attr("x", function () {
            return containerWidth - this.getComputedTextLength() - 5;
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
  }, [clusters, height, containerWidth, displayCount, currentPage]);

  useEffect(() => {
    setCurrentPage(0); // Reset to first page when clusters change
  }, [clusters]);

  // Handle page input change
  const handlePageInputChange = (e) => {
    const value = e.target.value;
    setPageInput(value);
  };

  const handlePageInputSubmit = (e) => {
    if (e.key === 'Enter') {
      const totalPages = Math.ceil(clusters.length / displayCount);
      const pageNum = parseInt(e.target.value);

      if (isNaN(pageNum) || pageNum < 1) {
        setCurrentPage(0);
      } else if (pageNum > totalPages) {
        setCurrentPage(totalPages - 1);
      } else {
        setCurrentPage(pageNum - 1);
      }
      setPageInput('');
    }
  };

  // Add pagination controls
  const renderPaginationControls = () => {
    if (clusters?.length <= 10) return null;

    const totalPages = Math.ceil(clusters.length / displayCount);
    const hasNextPage = (currentPage + 1) * displayCount < clusters.length;
    const hasPrevPage = currentPage > 0;

    return (
      <div className="pagination-controls">
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px'
        }}>
          <button
            className="pagination-button"
            onClick={() => setCurrentPage(currentPage - 1)}
            disabled={!hasPrevPage}
          >
            ←
          </button>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className={`pagination-button ${displayCount === 10 ? 'active' : ''}`}
              onClick={() => { setDisplayCount(10); setCurrentPage(0) }}
            >
              10
            </button>
            <button
              className={`pagination-button ${displayCount === 20 ? 'active' : ''}`}
              onClick={() => { setDisplayCount(20); setCurrentPage(0) }}
            >
              20
            </button>
            {clusters.length > 20 && (
              <button
                className={`pagination-button ${displayCount === 50 ? 'active' : ''}`}
                onClick={() => { setDisplayCount(50); setCurrentPage(0) }}
              >
                50
              </button>
            )}
          </div>

          <button
            className="pagination-button"
            onClick={() => setCurrentPage(currentPage + 1)}
            disabled={!hasNextPage}
          >
            →
          </button>

          <div className="pagination-info" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            Page <input
              type="text"
              value={pageInput}
              onChange={handlePageInputChange}
              onKeyDown={handlePageInputSubmit}
              placeholder={currentPage + 1}
              style={{
                width: '40px',
                padding: '4px',
                borderRadius: '4px',
                border: '1px solid #e0e0e0',
                textAlign: 'center'
              }}
            /> of {totalPages}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{
      height: '85vh',
      display: 'flex',
      flexDirection: 'column',
      padding: '10px',
      boxSizing: 'border-box'
    }}>
      {renderPaginationControls()}
      <div
        id={id}
        ref={containerRef}
        style={{
          flex: 1,
          border: '1px solid #ccc',
          overflow: 'auto',
          userSelect: 'none',
          width: '100%',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <svg ref={svgRef} style={{ minHeight: 'min-content' }} />
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
    </div>
  );
};

export default OrthoPlot;