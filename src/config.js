import {color} from './lib/mapStyles.js';

export default {
  /**
   * This is our caching backend
   */
  // This used to work, but seems like GitHub no longer allows large website hosting:
  //areaServer: 'https://anvaka.github.io/index-large-cities/data',
  //areaServer: 'http://localhost:8085', // This is un-commented when I develop cache locally
  // So, using S3
  areaServer: 'https://d2uf7yjjctyxf.cloudfront.net/nov-02-2020',

  /**
   * Serverless function that reads Overture Maps streets (api/overture.mjs).
   */
  overtureApi: '/api/overture',

  // Map colors follow the light / dark mode (see lib/mapStyles.js).
  getDefaultLineColor() {
    return color('roads');
  },
  getLabelColor() {
    return color('title');
  },
  getStreetNamesColor() {
    return color('labels');
  },
  getParcelsColor() {
    return color('parcels');
  },

  getBackgroundColor() {
    return color('background');
  }
}