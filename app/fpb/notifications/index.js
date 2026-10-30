import Notifications from './Notifications';
import ImportMessages from './ImportMessages';
import './Notifications.css';

/** The message stack on the canvas and the importer's messages in it (016e D1) */
export default {
  __init__: ['fpbNotifications', 'importMessages'],
  fpbNotifications: ['type', Notifications],
  importMessages: ['type', ImportMessages]
};
