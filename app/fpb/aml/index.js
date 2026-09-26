import AmlSupport from './AmlSupport';
import AmlMarkers from './AmlMarkers';
import './AmlMarkers.css';

export default {
  __init__: ['amlSupport', 'amlMarkers'],
  amlSupport: ['type', AmlSupport],
  amlMarkers: ['type', AmlMarkers]
};
