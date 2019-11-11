import inherits from 'inherits';

import CommandInterceptor from 'diagram-js/lib/command/CommandInterceptor';
import {
    add as collectionAdd,
    remove as collectionRemove
} from 'diagram-js/lib/util/Collections';

import { isAny, is } from '../../help/utils';


export default function DataBehavior(eventBus, fpbjs) {

    this._fpbjs = fpbjs;
    this._eventBus = eventBus;
    CommandInterceptor.call(this, eventBus);
    this._eventBus.on('dataStore.addedProjectDefinition', (e) => {
        let projectDefinition = e.projectDefinition;
        var processes = this._fpbjs.getProcesses();
        collectionAdd(processes, projectDefinition);
    });
    this._eventBus.on('dataStore.newProcess', (e) => {
        let process = e.newProcess.businessObject;
        var processes = this._fpbjs.getProcesses();
        collectionAdd(processes, { process: process, elementDataInformation: [], elementVisualInformation: [] });
        this._eventBus.fire('dataStore.update', {
            processId: process.id
        })
    });

    this._eventBus.on('dataStore.update', (e) => {
        let processId = e.processId;
        let processes = this._fpbjs.getProcesses();
        processes.forEach((pro) => {
            if (pro.process && pro.process.id == processId) {
                pro.elementDataInformation = [];
                pro.elementVisualInformation = [];
                let processElementsContainer = pro.process.elementsContainer;
                let systemLimitContainer;
                processElementsContainer.forEach((el) => {
                    if (is(el, 'fpb:SystemLimit')) {
                        systemLimitContainer = el.businessObject.elementsContainer;
                    }
                    collectionAdd(pro.elementVisualInformation, el)
                    collectionAdd(pro.elementDataInformation, el.businessObject);
                })
                if (systemLimitContainer) {
                    systemLimitContainer.forEach((el) => {
                        collectionAdd(pro.elementVisualInformation, el)
                        collectionAdd(pro.elementDataInformation, el.businessObject)
                    })
                }
            }
        })
    })

    this._eventBus.on('dataStore.updateAll', (e) => {
        let processes = this._fpbjs.getProcesses();
        processes.forEach((pro) => {
            if (pro.process) {
                this._eventBus.fire('dataStore.update', {
                    processId: pro.process.id
                })
            }
            else{
                pro.entryPoint = pro.entryPoint.id;
                
            }
        })
    })

    this._eventBus.on('dataStore.processDeleted', (e) => {
        let process = e.deletedProcess.businessObject;
        let processIds = [process.id];
        var processes = this._fpbjs.getProcesses();
        // Löschen des Prozesses und aller damit verbundenen Prozesse
        while (processIds.length > 0) {
            let id = processIds.pop();
            processes.forEach((pro) => {
                if (pro.process && pro.process.id == id) {
                    pro.process.consistsOfProcesses.forEach((childProcess) => {
                        processIds.push(childProcess.id)
                    });
                    collectionRemove(processes, pro);
                }
            })
        }
    })
}

inherits(DataBehavior, CommandInterceptor);

DataBehavior.$inject = [
    'eventBus',
    'fpbjs'
];