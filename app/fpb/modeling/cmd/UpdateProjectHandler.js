/**
 * Command 'fpb.updateProject': name and namespace of the project. The project
 * is no shape, so element.updateProperties cannot reach it (016b T5). Fires
 * 'fpb.projectChanged' after execute, undo and redo, so the panel follows.
 */
export default function UpdateProjectHandler(fpbjs, eventBus) {
  this._fpbjs = fpbjs;
  this._eventBus = eventBus;
}

UpdateProjectHandler.$inject = ['fpbjs', 'eventBus'];

UpdateProjectHandler.prototype.execute = function (context) {
  const project = this._fpbjs.getProjectDefinition();
  context.project = project;
  if (!context.oldProperties) {
    context.oldProperties = {};
    Object.keys(context.properties).forEach((key) => {
      context.oldProperties[key] = project[key];
    });
  }
  Object.keys(context.properties).forEach((key) => {
    project[key] = context.properties[key];
  });
  this._eventBus.fire('fpb.projectChanged', { project });
  return [];
};

UpdateProjectHandler.prototype.revert = function (context) {
  Object.keys(context.oldProperties).forEach((key) => {
    context.project[key] = context.oldProperties[key];
  });
  this._eventBus.fire('fpb.projectChanged', { project: context.project });
  return [];
};
