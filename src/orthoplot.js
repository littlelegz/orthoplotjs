var orthoplot = {
  label_height: 12,
  unique_id: 0
};

orthoplot.geneArrowPoints = function(orf, height, offset, space, scale) {
  let cap = offset + orthoplot.label_height + space;
  let bottom = offset + orthoplot.label_height + height - space;

  let start = scale(orf.start);
  let end = scale(orf.end);

  let middle = (cap + bottom)/2;

  let box_end = Math.max(scale(orf.end) - (2 * space), start);
  let box_start = Math.min(scale(orf.start) + (2 * space), end);

  if (orf.strand == 1) {
    points = "" + start + "," + cap;
    points += " " + box_end + "," + cap;
    points += " " + end + "," + middle;
    points += " " + box_end + "," + bottom;
    points += " " + start + "," + bottom;
    return points;
  }
  if (orf.strand == -1) {
    points = "" + start + "," + middle;
    points += " " + box_start + "," + cap;
    points += " " + end + "," + cap;
    points += " " + end + "," + bottom;
    points += " " + box_start + "," + bottom;
    return points;
  }
  if (orf.strand == 0) {
    points = "" + start + "," + cap;
    points += " " + end + "," + cap;
    points += " " + end + "," + bottom;
    points += " " + start + "," + bottom;
    return points;
  }
};

orthoplot.rnaTrianglePoints = function(orf, height, offset, space, scale) {
  let cap = offset + orthoplot.label_height + space;
  let bottom = offset + orthoplot.label_height + height - space;

  let start = scale(orf.start);
  let end = scale(orf.end);

  let center = (start + end) / 2;

  let points = "" + start + "," + bottom;
  points += " " + center + "," + cap;
  points += " " + end + "," + bottom;
  points += " " + start + "," + bottom;
  return points;
}

orthoplot.repeatDiamondPoints = function(orf, height, offset, space, scale) {
  let cap = offset + orthoplot.label_height + space;
  let bottom = offset + orthoplot.label_height + height - space;

  let start = scale(orf.start);
  let end = scale(orf.end);

  let center = (start + end) / 2;
  let middle = (cap + bottom)/2;

  let points = "" + start + "," + middle;
  points += " " + center + "," + cap;
  points += " " + end + "," + middle;
  points += " " + center + "," + bottom;
  points += " " + start + "," + middle;
  return points;
}

orthoplot.drawOrderedClusterOrfs = function(
  cluster, chart, all_orfs, all_repeats, all_rnas,
  scale, i, idx, height, width,
  single_cluster_height, space) {

  // Draw the line representing the edge of the contigs
  let contigLength = cluster.contigLength;
  let start_pos = scale(0);
  let rev = cluster.start + cluster.end > 0 ? 1 : -1; // check to see if we need to use minus strand to scale the data
  let end_pos = Number(scale(contigLength * rev));

  let tooltip = d3.select("body").append("div").attr('class', 'tooltip').style("opacity", 0);

  let drawOrfByType = function(geneType, drawShapeFun, inputData) {
    chart.selectAll("polygon.orthoplot-gene-" + geneType)
      .data(inputData)
      .enter().append("polygon")
      .attr("points", function(d) {
        return drawShapeFun(d, height, (single_cluster_height * i), space, scale)
      })
      .attr("class", function(d) {
        return "orthoplot-type-" + d.type + " orthoplot-gene-" + geneType + " orthoplot-gene";
      })
      .attr("id", function(d) {
        return idx + "-cluster" + cluster.idx + "-" + orthoplot.tag_to_id(d.geneName) + "-orf";
      })
      .attr("name", function(d) {
        return d.orthoTag ? d.orthoTag : null;
      })
      .attr("style", function(d) {
        if (d.color !== undefined && d.type == "CDS") {
          return "fill:" + d.color;
        }
      })
      .on("mouseover", function(d) {
        let orthoTag = this.__data__.orthoTag
        tooltip.transition()
          .duration(200)
          .style('opacity', .9)
        tooltip.html((orthoTag ? "orthoTag=" + orthoTag + "<br>" : "") + this.__data__.description)
          .style('left', d.pageX + 'px')
          .style('top', d.pageY + 'px')
      })
      .on("mouseout", function(d) {
        tooltip.transition()
          .duration(500)
          .style("opacity", 0);
      });
  }

  chart.append("line")
    .attr("x1", Math.min(width, Math.max(start_pos, 0)))
    .attr("y1", (single_cluster_height * i) + orthoplot.label_height + (height / 2))
    .attr("x2", Math.max(0, Math.min(width, end_pos)))
    .attr("y2", (single_cluster_height * i) + orthoplot.label_height + (height / 2))
    .attr("class", "orthoplot-line")

  drawOrfByType(geneType = "CDS", drawShapeFun = orthoplot.geneArrowPoints, inputData = all_orfs);

  drawOrfByType(geneType = "RNA", drawShapeFun = orthoplot.rnaTrianglePoints, inputData = all_rnas);

  drawOrfByType(geneType = "repeat", drawShapeFun = orthoplot.repeatDiamondPoints, inputData = all_repeats);

};

/**
 * 
 * @param {*} id - the id of the container to draw the clusters in
 * @param {*} clusters - contig? object which contains genes
 * @param {*} height 
 * @param {*} width 
 */
orthoplot.drawClusters = function(id, clusters, height, width) {
  let container = d3.select("#" + id);
  let single_cluster_height = height + (2 * orthoplot.label_height);
  container.selectAll("svg").remove();
  container.selectAll("div").remove();
  let chart = container.append("svg")
    .attr("height", single_cluster_height * clusters.length)
    .attr("width", width);

  let all_orfs = [];
  let all_rnas = [];
  let all_repeats = [];

  for (i = 0; i < clusters.length; i++) {

    let cluster = clusters[i];
    all_orfs.push.apply(all_orfs, cluster.genes.filter(n => n.type == "CDS"));
    all_rnas.push.apply(all_rnas, cluster.genes.filter(n => n.type.match(/RNA/)));
    all_repeats.push.apply(all_repeats, cluster.genes.filter(n => n.type.match(/repeat/)));

    let idx = orthoplot.unique_id++;
    let space = height / 10;

    let x = d3.scaleLinear()
      .domain([cluster.start, cluster.end])
      .range([0, width]);

    orthoplot.drawOrderedClusterOrfs(cluster, chart, all_orfs, all_repeats, all_rnas,
      x, i, idx, height, width,
      single_cluster_height, space);
  }

  for (i = 0; i < clusters.length; i++) {
    let cluster = clusters[i];
    if (cluster.label !== undefined) {
      chart.append("text")
        .text(cluster.label)
        .attr("class", "orthoplot-clusterlabel")
        .attr("x", function() {
          return width - this.getComputedTextLength() - 5
        })
        .attr("y", function() {
          return (single_cluster_height * i) + orthoplot.label_height
        })
        .attr("font-size", orthoplot.label_height);
    }
  }
};

orthoplot.tag_to_id = function(tag) {
  return tag.replace(/(:|\.)/g, '-').replace(/-orf/g, '_orf');
}
