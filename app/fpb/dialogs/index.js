import Dialogs from './Dialogs';
import Confirmations from './Confirmations';
import './Dialogs.css';

/** Native dialogs of the modeler and the answers to confirmation.required (016e D1) */
export default {
  __init__: ['fpbDialogs', 'confirmations'],
  fpbDialogs: ['type', Dialogs],
  confirmations: ['type', Confirmations]
};
