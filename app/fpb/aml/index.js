import AmlSupport from './AmlSupport';
import AmlMarkers from './AmlMarkers';
import AmlOverviewService from './AmlOverviewService';
import './AmlMarkers.css';
import './AmlOverview.css';

export default {
  __init__: ['amlSupport', 'amlMarkers'],
  amlSupport: ['type', AmlSupport],
  amlMarkers: ['type', AmlMarkers],
  amlOverview: ['type', AmlOverviewService]
};
