import GridLayer from './GridLayer.js';
import Query from './Query.js';
import LoadOptions from './LoadOptions.js';
import Progress from './Progress.js';
import {findBoundaryByAreaId} from './findBoundaryByName.js';
import config from '../config.js';


/**
 * Downloads parcels (buildings, land use and plots) for the same place as the
 * roads, on demand, and shows them as a separate line layer under the roads.
 */
export default class ParcelsLayer {
  constructor(scene, roadsGrid, roadsLayer, onStatus) {
    this.scene = scene;
    this.roadsGrid = roadsGrid;
    this.roadsLayer = roadsLayer;
    this.onStatus = onStatus || Function.prototype;
    this.layer = null;
    this.grid = null;
    this.visible = false;
    this.progress = null;
    this.status = 'idle';
  }

  show() {
    this.visible = true;
    if (this.layer) {
      this.layer.show();
      this.keepRoadsOnTop();
      return;
    }
    if (this.status !== 'loading') this.load();
  }

  hide() {
    this.visible = false;
    if (this.layer) this.layer.hide();
  }

  load() {
    this.setStatus('loading');
    let progress = this.progress = new Progress();
    getBounds(this.roadsGrid)
      .then(bounds => {
        if (progress.isCancelled) throw {cancelled: true};
        return Query.runFromOptions(new LoadOptions(Object.assign({
          wayFilter: Query.Parcels,
          outputMethod: 'body'
        }, bounds)), progress);
      })
      .then(grid => {
        if (progress.isCancelled) return;
        if (!grid.hasRoads()) {
          this.setStatus('empty');
          return;
        }
        // Same projection as the roads, so both layers line up.
        this.roadsGrid.getProjector(); // makes sure the d3 projector exists
        grid.setProjector(this.roadsGrid.projector);
        this.grid = grid;
        let layer = this.layer = new GridLayer();
        layer.id = 'parcels';
        layer.color = this.color || config.getParcelsColor();
        if (!this.visible) layer.hidden = true;
        layer.setGrid(grid);
        this.scene.add(layer);
        this.keepRoadsOnTop();
        this.setStatus('ready');
      })
      .catch(err => {
        if (err && err.cancelled) return;
        console.error(err);
        this.setStatus('error');
      });
  }

  keepRoadsOnTop() {
    // Layers are drawn in the order they were added. Re-adding the roads puts
    // them above the parcels.
    let roads = this.roadsLayer;
    if (!roads || roads.hidden) return;
    roads.hide();
    roads.show();
  }

  setStatus(status) {
    this.status = status;
    this.onStatus(status);
  }

  dispose() {
    if (this.progress) this.progress.cancel();
    this.layer = null;
    this.grid = null;
  }
}

function getBounds(grid) {
  let bounds = grid.queryBounds;
  if (bounds && bounds.bbox) {
    return Promise.resolve({areaId: bounds.areaId, bbox: bounds.bbox, boundary: bounds.boundary});
  }
  if (grid.isArea && grid.id) {
    // Cities that came from the cache only know their area id.
    return findBoundaryByAreaId(grid.id)
      .catch(() => null)
      .then(found => found ? {areaId: grid.id, bbox: found.bbox, boundary: found.boundary} : {areaId: grid.id});
  }
  if (grid.bboxString) {
    return Promise.resolve({bbox: grid.bboxString.split(',').map(Number)});
  }
  return Promise.reject(new Error('Unknown place bounds'));
}
