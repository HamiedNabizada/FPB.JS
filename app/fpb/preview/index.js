import OverlaysModule from 'diagram-js/lib/features/overlays';
import DecompositionPreview from './DecompositionPreview';

export default {
  __depends__: [OverlaysModule],
  __init__: ['decompositionPreview'],
  decompositionPreview: ['type', DecompositionPreview]
};
