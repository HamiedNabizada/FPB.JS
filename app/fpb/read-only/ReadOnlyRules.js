import inherits from 'inherits';
import RuleProvider from 'diagram-js/lib/features/rules/RuleProvider';

// above FpbRuleProvider, whose delete rule fires a confirmation of its own
const PRIORITY = 5000;

/**
 * Rules that change the model; the interactions ask them before they start.
 */
const CHANGING = [
  'elements.move',
  'elements.create',
  'elements.delete',
  'shape.create',
  'shape.append',
  'shape.resize',
  'connection.create',
  'connection.reconnect',
  'connection.updateWaypoints'
];

/**
 * The second line of the read-only mode: every interaction that asks the
 * rules is refused. The lock itself misses some, e.g. the arrow keys, which
 * diagram-js binds directly (KeyboardMoveSelection) and not as an editor
 * action. Commands run through the API do not ask the rules and stay possible.
 */
export default function ReadOnlyRules(eventBus, canvasLock) {
  // before RuleProvider.call, which runs init()
  this._canvasLock = canvasLock;

  RuleProvider.call(this, eventBus);
}

ReadOnlyRules.$inject = ['eventBus', 'canvasLock'];

inherits(ReadOnlyRules, RuleProvider);

ReadOnlyRules.prototype.init = function () {
  const canvasLock = this._canvasLock;

  this.addRule(CHANGING, PRIORITY, function () {
    if (canvasLock.isLocked()) {
      return false;
    }
  });
};
