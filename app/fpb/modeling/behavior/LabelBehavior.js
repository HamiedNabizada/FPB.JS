import {
    assign
} from 'min-dash';

import inherits from 'inherits';
import CommandInterceptor from 'diagram-js/lib/command/CommandInterceptor';
import {
    is,
    getBusinessObject,
    isLabelExternal,
    getExternalLabelMid
} from '../../help/utils';

var DEFAULT_LABEL_DIMENSIONS = {
    width: 90,
    height: 20
};

var NAME_PROPERTY = 'name';


export default function LabelBehavior(eventBus, fpbFactory, modeling, textRenderer) {
    CommandInterceptor.call(this, eventBus);

    // update label if name property was updated
    this.postExecute('element.updateProperties', function (e) {
        var context = e.context,
            element = context.element,
            properties = context.properties;

        if (NAME_PROPERTY in properties) {
            modeling.updateLabel(element, properties[NAME_PROPERTY]);
        };
    });

    // create label shape after shape/connection was created
    this.postExecute(['shape.create', 'connection.create'], function (e) {
        var context = e.context;

        var element = context.shape || context.connection,
            businessObject = element.businessObject;

        if (!isLabelExternal(element)) {
            return;
        };

        // only create label if name
        if (!businessObject.name) {
            return;
        };
        var labelCenter = getExternalLabelMid(element);

        // we don't care about x and y
        var labelDimensions = textRenderer.getExternalLabelBounds(
            DEFAULT_LABEL_DIMENSIONS,
            businessObject.name || ''
        );
        modeling.createLabel(element, labelCenter, {
            id: businessObject.id + '_label',
            businessObject: businessObject,
            width: labelDimensions.width,
            height: labelDimensions.height
        });

    });

    // update label after label shape was deleted
    this.postExecute('shape.delete', function (event) {
        var context = event.context,
            labelTarget = context.labelTarget,
            hints = context.hints || {};

        // check if label
        if (labelTarget && hints.unsetLabel !== false) {
            modeling.updateLabel(labelTarget, null, null, { removeShape: false });
        }
    });

    // update di information on label creation

    this.postExecute(['label.create'], function (event) {
        var context = event.context,
            element = context.shape,
            businessObject,
            di;

        if (!element.labelTarget) {
            return;
        };

        if (!is(element.labelTarget || element, 'fpb:BaseElement')) {
            return;
        };

        businessObject = element.businessObject,
            di = businessObject.di;
        if (!di.label) {
            di.label = fpbFactory.create('fpbjsdi:FPBJSLabel', {
                bounds: fpbFactory.create('dc:Bounds')
            });
        }

        assign(di.label.bounds, {
            x: element.x,
            y: element.y,
            width: element.width,
            height: element.height
        });
        
    });

}

inherits(LabelBehavior, CommandInterceptor);

LabelBehavior.$inject = [
    'eventBus',
    'fpbFactory',
    'modeling',
    'textRenderer',
];