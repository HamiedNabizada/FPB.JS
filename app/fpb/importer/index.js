import JSONImporter from './JSONImporter';
import XMLImporter from './XMLImporter';

export default {

  __init__: [ 'jsonImporter', 'xmlImporter' ],
  jsonImporter: [ 'type', JSONImporter ],
  xmlImporter: [ 'type', XMLImporter ]
};