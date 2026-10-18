import inherits from 'inherits';
import CommandInterceptor from 'diagram-js/lib/command/CommandInterceptor';

import { is } from '../../help/utils';
import { stateCopies } from '../../help/processShapes';

/** Properties that belong to the state, not to one of its pictures */
const SHARED = ['identification', 'characteristics'];

const isEmpty = (value) => value === undefined || value === null || value === '' ||
  (Array.isArray(value) && value.length === 0);

/** The content of a model value, without moddle internals and empty fields */
function content(value, depth = 0) {
  if (isEmpty(value)) {
    return null;
  }
  if (typeof value !== 'object' || depth > 8) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => content(entry, depth + 1));
  }
  const out = value.$type ? { $type: value.$type } : {};
  Object.keys(value).sort().forEach((key) => {
    if (key.charAt(0) !== '$' && !isEmpty(value[key])) {
      out[key] = content(value[key], depth + 1);
    }
  });
  return out;
}

const sameContent = (a, b) => a === b || JSON.stringify(content(a)) === JSON.stringify(content(b));

/**
 * A boundary state is one object of the model, shown on several layers. Its
 * copies start out sharing the identification and the list of characteristics
 * (helpUtils.createStateShapeForNewLayer), but both properties panels write a
 * new object through updateProperties, and that lands on the edited copy only:
 * the first edit split the copies (B14). Hand the new object to every copy that
 * agreed with the edited one, within the same command, so one undo takes it
 * back everywhere.
 *
 * Copies an older file left different (each layer saved on its own, 020 §2)
 * keep their own data: overwriting them would lose it, and aligning them is a
 * decision still open (020a).
 */
export default function StateCopySyncBehavior(eventBus, fpbjs) {
  CommandInterceptor.call(this, eventBus);

  // executed runs on execute and on redo; postExecute would miss the redo
  this.executed('element.updateProperties', function (event) {
    const context = event.context;

    if (context.copyWrites) {
      context.copyWrites.forEach(function (write) {
        write.target[write.key] = write.newValue;
      });
      return;
    }

    const element = context.element;
    const keys = SHARED.filter(function (key) {
      return context.properties && key in context.properties;
    });
    if (!keys.length || !is(element, 'fpb:State')) {
      return;
    }

    // what the edited copy held before, set by the handler's execute
    const old = context.oldProperties || {};
    const writes = [];
    stateCopies(fpbjs.getProjectDefinition(), element).forEach(function (copy) {
      const businessObject = copy.businessObject;
      keys.forEach(function (key) {
        if (!sameContent(businessObject[key], old[key])) {
          return;
        }
        writes.push({ target: businessObject, key, oldValue: businessObject[key], newValue: element.businessObject[key] });
        businessObject[key] = element.businessObject[key];
      });
    });
    context.copyWrites = writes;
  });

  this.reverted('element.updateProperties', function (event) {
    const writes = event.context.copyWrites || [];
    for (let i = writes.length - 1; i >= 0; i--) {
      writes[i].target[writes[i].key] = writes[i].oldValue;
    }
  });
}

inherits(StateCopySyncBehavior, CommandInterceptor);

StateCopySyncBehavior.$inject = ['eventBus', 'fpbjs'];
