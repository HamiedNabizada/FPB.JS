import {
  assign
} from 'min-dash';

export default function FpbPaletteProvider(create, elementFactory, lassoTool,
  palette, spaceTool, handTool, translate) {
  this._create = create;
  this._elementFactory = elementFactory;
  this._lassoTool = lassoTool;
  this._palette = palette;
  this._spaceTool = spaceTool;
  this._handTool = handTool;
  this._translate = translate;

  palette.registerProvider(this);
}

FpbPaletteProvider.$inject = [
  'create',
  'elementFactory',
  'lassoTool',
  'palette',
  'spaceTool',
  'handTool',
  'translate'
];


FpbPaletteProvider.prototype.getPaletteEntries = function () {

  var actions = {},
    create = this._create,
    elementFactory = this._elementFactory,
    spaceTool = this._spaceTool,
    lassoTool = this._lassoTool,
    handTool = this._handTool,
    translate = this._translate;
  function createAction(type, group, className, title, options) {

    function createListener(event) {
      var shape = elementFactory.createShape(assign({ type: type }, options));
      create.start(event, shape);
    }

    var shortType = type.replace(/^fpb:/, '');
    return {
      group: group,
      className: className,
      title: title || 'Create ' + shortType,
      action: {
        dragstart: createListener,
        click: createListener
      }
    };
  }

  assign(actions, {
    'fpb-systemlimit': createAction(
      'fpb:SystemLimit', 'fpb', 'icon-fpb-systemlimit', translate('Add System Limit')
    ),
    'fpb-product': createAction(
      'fpb:Product', 'fpb', 'icon-fpb-product', translate('Add Product')
    ),
    'fpb-energy': createAction(
      'fpb:Energy', 'fpb', 'icon-fpb-energy', translate('Add Energy')
    ),
    'fpb-information': createAction(
      'fpb:Information', 'fpb', 'icon-fpb-information', translate('Add Information')
    ),
    'fpb-processoperator': createAction(
      'fpb:ProcessOperator', 'fpb', 'icon-fpb-processoperator', translate('Add Process Operator')
    ),
    'fpb-technicalresource': createAction(
      'fpb:TechnicalResource', 'fpb', 'icon-fpb-technicalresource', translate('Add Technical Resource')
    ),

    'tool-separator': {
      group: 'tools',
      separator: true
    },

    'lasso-tool': {
      group: 'tools',
      className: 'palette-icon-lasso-tool',
      title: translate('Activate Lasso Tool'),
      action: {
        click: function (event) {
          lassoTool.activateSelection(event);
        }
      }
    },
    'space-tool': {
      group: 'tools',
      className: 'palette-icon-space-tool',
      title: translate('Activate the create/remove space tool'),
      action: {
        click: function (event) {
          spaceTool.activateSelection(event);
        }
      }
    },
    'hand-tool': {
      group: 'tools',
      className: 'palette-icon-hand-tool',
      title: translate('Activate the hand tool'),
      action: {
        click: function (event) {
          handTool.activateHand(event);
        }
      }
    }
  }
  );
  return actions;
};