class Quadtree {
  constructor(maxNodes = 1024, maxPoints = 4096, capacity = 4) {
    this.capacity = capacity;

    // --- Node data (SoA) ---
    this.node_x = new Float32Array(maxNodes);
    this.node_y = new Float32Array(maxNodes);
    this.node_w = new Float32Array(maxNodes);
    this.node_h = new Float32Array(maxNodes);

    this.node_firstChild = new Int32Array(maxNodes); // -1 = leaf
    this.node_pointCount = new Int32Array(maxNodes);
    this.node_firstPoint = new Int32Array(maxNodes);

    // --- Point storage ---
    this.point_x = new Float32Array(maxPoints);
    this.point_y = new Float32Array(maxPoints);

    // Linked list for points per node
    this.point_next = new Int32Array(maxPoints);

    // --- Counters ---
    this.nodeCount = 0;
    this.pointCount = 0;

    // root node
    this.root = this.createNode(0, 0, 200, 200);
  }

  createNode(x, y, w, h) {
    const i = this.nodeCount++;

    this.node_x[i] = x;
    this.node_y[i] = y;
    this.node_w[i] = w;
    this.node_h[i] = h;

    this.node_firstChild[i] = -1;
    this.node_pointCount[i] = 0;
    this.node_firstPoint[i] = -1;

    return i;
  }

  contains(nodeIndex, px, py) {
    return (
      px >= this.node_x[nodeIndex] - this.node_w[nodeIndex] &&
      px <= this.node_x[nodeIndex] + this.node_w[nodeIndex] &&
      py >= this.node_y[nodeIndex] - this.node_h[nodeIndex] &&
      py <= this.node_y[nodeIndex] + this.node_h[nodeIndex]
    );
  }

  subdivide(nodeIndex) {
    const x = this.node_x[nodeIndex];
    const y = this.node_y[nodeIndex];
    const w = this.node_w[nodeIndex] / 2;
    const h = this.node_h[nodeIndex] / 2;

    const base = this.nodeCount;
    this.node_firstChild[nodeIndex] = base;

    // NW, NE, SW, SE
    this.createNode(x - w, y - h, w, h);
    this.createNode(x + w, y - h, w, h);
    this.createNode(x - w, y + h, w, h);
    this.createNode(x + w, y + h, w, h);

    // --- redistribute existing points ---
    let p = this.node_firstPoint[nodeIndex];
    this.node_firstPoint[nodeIndex] = -1;
    this.node_pointCount[nodeIndex] = 0;

    while (p !== -1) {
      const next = this.point_next[p];
      this._insertIntoChildren(nodeIndex, p);
      p = next;
    }
  }

  _insertIntoChildren(nodeIndex, pointIndex) {
    const base = this.node_firstChild[nodeIndex];
    const px = this.point_x[pointIndex];
    const py = this.point_y[pointIndex];

    for (let i = 0; i < 4; i++) {
      const child = base + i;
      if (this.contains(child, px, py)) {
        this._insertPoint(child, pointIndex);
        return;
      }
    }
  }

  _insertPoint(nodeIndex, pointIndex) {
    // prepend into linked list
    this.point_next[pointIndex] = this.node_firstPoint[nodeIndex];
    this.node_firstPoint[nodeIndex] = pointIndex;
    this.node_pointCount[nodeIndex]++;
  }

  insert(px, py, nodeIndex = this.root) {
    if (!this.contains(nodeIndex, px, py)) return false;

    const child = this.node_firstChild[nodeIndex];

    // leaf
    if (child === -1) {
      if (this.node_pointCount[nodeIndex] < this.capacity) {
        const pIndex = this.pointCount++;

        this.point_x[pIndex] = px;
        this.point_y[pIndex] = py;
        this.point_next[pIndex] = -1;

        this._insertPoint(nodeIndex, pIndex);
        return true;
      }

      // subdivide and retry
      this.subdivide(nodeIndex);
    }

    // insert into children
    return this._insertIntoChildren(nodeIndex, this._createPoint(px, py));
  }

  _createPoint(px, py) {
    const i = this.pointCount++;

    this.point_x[i] = px;
    this.point_y[i] = py;
    this.point_next[i] = -1;

    return i;
  }
}