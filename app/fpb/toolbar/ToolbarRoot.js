/** @jsx h */
import { h } from '@bpmn-io/properties-panel/preact';
import { useEffect, useErrorBoundary, useState } from '@bpmn-io/properties-panel/preact/hooks';
import { faFileCirclePlus } from '@fortawesome/free-solid-svg-icons/faFileCirclePlus';
import { faFileImport } from '@fortawesome/free-solid-svg-icons/faFileImport';
import { faFloppyDisk } from '@fortawesome/free-solid-svg-icons/faFloppyDisk';
import { faFileExport } from '@fortawesome/free-solid-svg-icons/faFileExport';
import { faFileCode } from '@fortawesome/free-solid-svg-icons/faFileCode';
import { faFolder } from '@fortawesome/free-solid-svg-icons/faFolder';
import { faFolderOpen } from '@fortawesome/free-solid-svg-icons/faFolderOpen';
import { faListCheck } from '@fortawesome/free-solid-svg-icons/faListCheck';
import { faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons/faMagnifyingGlass';
import { faMoon } from '@fortawesome/free-solid-svg-icons/faMoon';
import { faSun } from '@fortawesome/free-solid-svg-icons/faSun';
import { faEye } from '@fortawesome/free-solid-svg-icons/faEye';
import { faEyeLowVision } from '@fortawesome/free-solid-svg-icons/faEyeLowVision';
import { faCircleInfo } from '@fortawesome/free-solid-svg-icons/faCircleInfo';

import { ToolbarButton } from './ToolbarButton';
import { useModelerState } from './useModelerState';
import { LayersTree } from '../layers/LayersTree';
import { describeCounts } from '../validation/FpbValidation';
import { getCtrlKey } from '../info/keyboardShortcuts';
import { isReadOnly } from '../read-only/ReadOnly';

/**
 * The toolbar in three cards of variant B (016c decisions 11, 12): file,
 * work, view (016f E1). A part that throws leaves a note in place of the
 * toolbar instead of taking the page with it.
 */
export default function ToolbarRoot(props) {
  const { modeler, showNewModel } = props;
  const translate = modeler.get('translate');
  const [failure] = useErrorBoundary((error) => console.error('[FPB.JS] toolbar', error));

  // mounted: whoever waits for the interface (the import) can go on
  useEffect(() => {
    modeler.get('eventBus').fire('ui.componentReady', { component: 'layerPanel' });
  }, [modeler]);

  if (failure) {
    return (
      <div class="fpb-toolbar fpb-toolbar-failed" role="alert">
        {translate('The toolbar stopped working. Details are in the console.')}
      </div>
    );
  }

  return (
    <div class="fpb-toolbar">
      <FileGroup modeler={modeler} translate={translate} showNewModel={showNewModel} />
      <WorkGroup modeler={modeler} translate={translate} />
      <ViewGroup modeler={modeler} translate={translate} />
    </div>
  );
}

function FileGroup(props) {
  const { modeler, translate, showNewModel } = props;
  const readOnly = useModelerState(modeler, 'readOnly.changed', () => isReadOnly(modeler));
  const amlSupport = modeler.get('amlSupport', false);
  const amlSource = useModelerState(modeler, 'aml.sourceChanged', () => (amlSupport ? amlSupport.getSource() : null));

  // the files belong to a host with files: false (016f V7)
  const files = (modeler.get('config') || {}).files !== false;
  // Starting over clears the browser backup, so it comes with the backup;
  // hosts without it can ask for the button with the option showNewModel.
  const autosave = modeler.get('autosave', false);
  const withNewModel = Boolean((autosave && autosave.isEnabled()) || showNewModel);
  const fpbFiles = modeler.get('fpbFiles');

  return (
    <div class="fpb-toolbar-group" data-group="file">
      {withNewModel && (
        <ToolbarButton
          id="newModelButton"
          label={readOnly ? translate('New model (not in read-only mode)') : translate('New model')}
          icon={faFileCirclePlus}
          disabled={readOnly}
          onClick={() => newModel(modeler, translate)}
        />
      )}
      {files && (
        <ToolbarButton
          id="openFileButton"
          label={readOnly ? translate('Open (not in read-only mode)') : translate('Open ({key}+O)', { key: getCtrlKey() })}
          icon={faFileImport}
          disabled={readOnly}
          onClick={() => fpbFiles.open()}
        />
      )}
      {files && (
        <ToolbarButton
          id="saveFileButton"
          label={translate('Save ({key}+S)', { key: getCtrlKey() })}
          icon={faFloppyDisk}
          onClick={() => fpbFiles.save()}
        />
      )}
      <ToolbarButton id="exportButton" label={translate('Export')} icon={faFileExport} onClick={() => fpbFiles.export()} />
      {amlSource && (
        <ToolbarButton
          id="amlOverviewButton"
          label={translate('AML file')}
          icon={faFileCode}
          onClick={() => modeler.get('amlOverview').open()}
        />
      )}
    </div>
  );
}

/**
 * Starts over with an empty model. Asks first when something would be lost:
 * with the browser backup on, only if the model has changes that are in no
 * file; without it, whenever there is a model.
 */
function newModel(modeler, translate) {
  const autosave = modeler.get('autosave', false);
  let wouldLoseWork;
  if (autosave && autosave.isEnabled()) {
    autosave.flush();
    wouldLoseWork = autosave.isDirty();
  } else {
    wouldLoseWork = modeler.getProcesses().length > 0;
  }
  if (!wouldLoseWork) {
    modeler.newModel();
    return;
  }
  modeler.get('fpbDialogs').confirm({
    title: translate('Start a new model?'),
    message: translate('The current model will be removed from the editor.'),
    details: translate('Changes that you have not downloaded are lost.'),
    confirmLabel: translate('Start new model'),
    danger: true
  }).then((confirmed) => {
    if (confirmed && !isReadOnly(modeler)) {
      modeler.newModel();
    }
  });
}

function WorkGroup(props) {
  const { modeler, translate } = props;
  const layers = modeler.get('fpbLayers');
  const layerCount = useModelerState(modeler, 'layers.changed', () => layers.count());
  const validation = modeler.get('fpbValidation');
  const counts = useModelerState(modeler, 'fpbValidation.changed', () => validation.getCounts());
  const [layersOpen, setLayersOpen] = useState(false);

  const shownFindings = counts.error + counts.warning;
  const checkLabel = translate('Model check (VDI 3682): {counts}', { counts: describeCounts(counts) });

  return (
    <div class="fpb-toolbar-group" data-group="work">
      {layerCount > 1 && (
        <div class="fpb-toolbar-layers">
          <ToolbarButton
            id="openLayerButton"
            label={layersOpen ? translate('Hide layers') : translate('Show layers')}
            icon={layersOpen ? faFolderOpen : faFolder}
            pressed={layersOpen}
            expanded={layersOpen}
            onClick={() => setLayersOpen(!layersOpen)}
          />
          <LayersCard modeler={modeler} translate={translate} open={layersOpen} />
        </div>
      )}
      <ToolbarButton id="openValidationButton" label={checkLabel} icon={faListCheck} onClick={() => validation.togglePanel()}>
        {shownFindings > 0 && (
          <span class={counts.error ? 'fpb-validation-count has-errors' : 'fpb-validation-count'}>{shownFindings}</span>
        )}
      </ToolbarButton>
      <ToolbarButton
        id="openSearchButton"
        label={translate('Search all layers')}
        icon={faMagnifyingGlass}
        onClick={() => modeler.get('fpbSearch').open()}
      />
    </div>
  );
}

/**
 * The tree of the layers and the project (016d). Once opened it stays in
 * the page and is only hidden, so the tree keeps its search and what is
 * expanded (016f E1, plan decision 3).
 */
function LayersCard(props) {
  const { modeler, translate, open } = props;
  const [shown, setShown] = useState(open);
  const projectName = useModelerState(modeler, 'layers.changed', () => {
    const project = modeler.getProjectDefinition && modeler.getProjectDefinition();
    return (project && project.name) || '';
  });

  useEffect(() => {
    if (open) {
      setShown(true);
    }
  }, [open]);

  if (!shown && !open) {
    return null;
  }
  return (
    <div class="fpb-layers" hidden={!open}>
      <div class="fpb-layers-title">{translate('Layers')}</div>
      <LayersTree modeler={modeler} />
      <div class="fpb-layers-project">
        <span class="fpb-layers-project-label">{translate('Project')}</span>
        <span class="fpb-layers-project-name">{projectName}</span>
      </div>
    </div>
  );
}

function ViewGroup(props) {
  const { modeler, translate } = props;
  const theme = modeler.get('fpbTheme');
  const themeState = useModelerState(modeler, 'theme.changed', () => ({ current: theme.get(), host: theme.isHostControlled() }));
  const colors = modeler.get('colorSchemeService');
  const scheme = useModelerState(modeler, 'colorScheme.changed', () => colors.get());

  const dark = themeState.current === 'dark';
  const accessible = scheme === 'accessible';

  return (
    <div class="fpb-toolbar-group" data-group="view">
      {!themeState.host && (
        <ToolbarButton
          label={dark ? translate('Switch to Light Mode') : translate('Switch to Dark Mode')}
          icon={dark ? faSun : faMoon}
          onClick={() => theme.choose(dark ? 'light' : 'dark')}
        />
      )}
      <ToolbarButton
        id="colorSchemeButton"
        label={accessible ? translate('Back to the colours of VDI 3682') : translate('Colours for colour vision deficiency')}
        icon={accessible ? faEye : faEyeLowVision}
        pressed={accessible}
        onClick={() => colors.set(accessible ? 'standard' : 'accessible')}
      />
      <ToolbarButton
        label={translate('Show information and help')}
        icon={faCircleInfo}
        onClick={() => modeler.get('fpbInfo').open()}
      />
    </div>
  );
}
