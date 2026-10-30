import Files from './Files';
import FileShortcuts from './FileShortcuts';
import CanvasDrop from './CanvasDrop';
import './Files.css';

/** Open, save and export (016e D2) */
export default {
  __init__: ['fpbFiles', 'fileShortcuts', 'canvasDrop'],
  fpbFiles: ['type', Files],
  fileShortcuts: ['type', FileShortcuts],
  canvasDrop: ['type', CanvasDrop]
};
