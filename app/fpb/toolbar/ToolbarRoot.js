/** @jsx h */
import { h } from '@bpmn-io/properties-panel/preact';
import { useEffect, useErrorBoundary, useState } from '@bpmn-io/properties-panel/preact/hooks';
import { createPortal } from '@bpmn-io/properties-panel/preact/compat';
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
import { faSliders } from '@fortawesome/free-solid-svg-icons/faSliders';

import { ToolbarButton, TooltipContext } from './ToolbarButton';
import { useModelerState } from '../ui/useModelerState';
import { LayersTree } from '../layers/LayersTree';
import { describeCounts } from '../validation/FpbValidation';
import { getCtrlKey, keyLabel } from '../info/keyboardShortcuts';
import { useLanguage } from '../ui/useLanguage';
import { isReadOnly } from '../read-only/ReadOnly';

/**
 * The toolbar in three cards of variant B (016c decisions 11, 12): file,
 * work, view (016f E1). A part that throws leaves a note in place of the
 * toolbar instead of taking the page with it.
 */
export default function ToolbarRoot(props) {
  const { modeler, showNewModel, tooltips } = props;
  const translate = modeler.get('translate');
  const [failure] = useErrorBoundary((error) => console.error('[FPB.JS] toolbar', error));
  // draws again in the new language (016h V3)
  useLanguage(modeler);

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
    <TooltipContext.Provider value={tooltips}>
      <div class="fpb-toolbar">
        <FileGroup modeler={modeler} translate={translate} showNewModel={showNewModel} />
        <WorkGroup modeler={modeler} translate={translate} />
        <ViewGroup modeler={modeler} translate={translate} />
      </div>
    </TooltipContext.Provider>
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
          label={readOnly ? translate('Open (not in read-only mode)') : translate('Open ({key}+O)', { key: keyLabel(getCtrlKey(), translate) })}
          icon={faFileImport}
          disabled={readOnly}
          onClick={() => fpbFiles.open()}
        />
      )}
      {files && (
        <ToolbarButton
          id="saveFileButton"
          label={translate('Save ({key}+S)', { key: keyLabel(getCtrlKey(), translate) })}
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
  // pressed while the list or its sheet is open (016g B5)
  const checkOpen = useModelerState(modeler, ['fpbValidation.panelChanged', 'sheets.changed'], () => validation.isPanelOpen());
  const [layersOpen, setLayersOpen] = useState(false);
  // narrow touch screens: properties, layers and the check as sheets (016f E2)
  const sheets = modeler.get('fpbSheets', false);
  const sheet = useModelerState(modeler, 'sheets.changed', () => ({
    active: !!(sheets && sheets.isActive()),
    current: sheets ? sheets.current() : null,
    body: sheets ? sheets.body() : null
  }));
  const layersShown = sheet.active ? sheet.current === 'layers' : layersOpen;
  const toggleLayers = () => (sheet.active
    ? sheets.toggle('layers', { title: translate('Layers') })
    : setLayersOpen(!layersOpen));

  const shownFindings = counts.error + counts.warning;
  const checkLabel = translate('Model check (VDI 3682): {counts}', { counts: describeCounts(counts, translate) });

  return (
    <div class="fpb-toolbar-group" data-group="work">
      {sheet.active && (
        <ToolbarButton
          id="propertiesSheetButton"
          label={translate('Properties')}
          icon={faSliders}
          pressed={sheet.current === 'properties'}
          onClick={() => sheets.toggle('properties', { title: translate('Properties') })}
        />
      )}
      {layerCount > 1 && (
        <div class="fpb-toolbar-layers">
          <ToolbarButton
            id="openLayerButton"
            label={layersShown ? translate('Hide layers') : translate('Show layers')}
            icon={layersShown ? faFolderOpen : faFolder}
            pressed={layersShown}
            expanded={layersShown}
            onClick={toggleLayers}
          />
          {!sheet.active && <LayersCard modeler={modeler} translate={translate} open={layersOpen} />}
        </div>
      )}
      {sheet.active && sheet.current === 'layers' && sheet.body && createPortal(
        <div class="fpb-layers fpb-layers--sheet">
          <LayersContent modeler={modeler} translate={translate} />
        </div>,
        sheet.body
      )}
      {validation.hasList() && (
        <ToolbarButton id="openValidationButton" label={checkLabel} icon={faListCheck} pressed={checkOpen} onClick={() => validation.togglePanel()}>
          {shownFindings > 0 && (
            <span class={counts.error ? 'fpb-validation-count has-errors' : 'fpb-validation-count'}>{shownFindings}</span>
          )}
        </ToolbarButton>
      )}
      <ToolbarButton
        id="openSearchButton"
        label={translate('Search all layers')}
        tip={translate('Search all layers ({key}+F)', { key: keyLabel(getCtrlKey(), translate) })}
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
      <LayersContent modeler={modeler} translate={translate} />
    </div>
  );
}

/** The tree and the project, in the card or in the sheet (016f E2) */
function LayersContent(props) {
  const { modeler, translate } = props;
  const projectName = useModelerState(modeler, 'layers.changed', () => {
    const project = modeler.getProjectDefinition && modeler.getProjectDefinition();
    return (project && project.name) || '';
  });
  return [
    <LayersTree key="tree" modeler={modeler} />,
    <div key="project" class="fpb-layers-project">
      <span class="fpb-layers-project-label">{translate('Project')}</span>
      <span class="fpb-layers-project-name">{projectName}</span>
    </div>
  ];
}

function ViewGroup(props) {
  const { modeler, translate } = props;
  // a host may leave the theme module out (options.modules): no button (016g E1)
  const theme = modeler.get('fpbTheme', false);
  const themeState = useModelerState(modeler, 'theme.changed', () => (
    theme ? { current: theme.get(), host: theme.isHostControlled() } : { current: 'light', host: true }
  ));
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
