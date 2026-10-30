import Files from './Files';
import FileShortcuts from './FileShortcuts';
import './Files.css';

/** Open, save and export (016e D2) */
export default {
  __init__: ['fpbFiles', 'fileShortcuts'],
  fpbFiles: ['type', Files],
  fileShortcuts: ['type', FileShortcuts]
};
