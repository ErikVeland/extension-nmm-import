import { setImportStep } from '../actions/session';

import { IModEntry } from '../types/nmmEntries';
import findInstances from '../util/findInstances';
import importMods from '../util/import';
import parseNMMConfigFile from '../util/nmmVirtualConfigParser';
import TraceImport from '../util/TraceImport';

import {
  FILENAME, FILES, LOCAL, MOD_ID, MOD_NAME, MOD_VERSION,
} from '../importedModAttributes';

import opn = require('opn');
import * as path from 'path';
import * as React from 'react';
import { Alert, Button, MenuItem, ProgressBar, SplitButton } from 'react-bootstrap';
import { translate } from 'react-i18next';
import { connect } from 'react-redux';
import * as Redux from 'redux';
import { ComponentEx, Icon, Modal, selectors, Spinner, Steps, Table,
         Toggle, types } from 'vortex-api';

type Step = 'start' | 'setup' | 'working' | 'review';

interface IConnectedProps {
  gameId: string;
  importStep?: Step;
}

interface IActionProps {
  onSetStep: (newState: Step) => void;
}

type IProps = IConnectedProps & IActionProps;

interface IComponentState {
  sources: string[][];
  selectedSource: string[];
  importArchives: boolean;
  modsToImport: { [id: string]: IModEntry };
  error: string;
  importEnabled: { [id: string]: boolean };
  counter: number;
  progress: { mod: string, pos: number };
  failedImports: string[];
}

class ImportDialog extends ComponentEx<IProps, IComponentState> {
  private static STEPS: Step[] = [ 'start', 'setup', 'working', 'review' ];

  private mStatus: types.ITableAttribute;
  private mTrace: TraceImport;

  constructor(props: IProps) {
    super(props);

    this.initState({
      sources: undefined,
      importArchives: false,
      modsToImport: undefined,
      selectedSource: [],
      error: undefined,
      importEnabled: {},
      counter: 0,
      progress: undefined,
      failedImports: [],
    });

    this.mStatus = {
      id: 'status',
      name: 'Import',
      description: 'The import status of the mod',
      icon: 'level-up',
      calc: (mod: IModEntry) => this.isModEnabled(mod) ? 'Import' : 'Don\'t import',
      placement: 'both',
      isToggleable: true,
      isSortable: true,
      isVolatile: true,
      edit: {
        inline: true,
        choices: () => [
          { key: 'yes', text: 'Import' },
          { key: 'no', text: 'Don\'t import' },
        ],
        onChangeValue: (mod: IModEntry, value: any) => {
          this.nextState.importEnabled[mod.modFilename] = (value === undefined)
            ? !(this.state.importEnabled[mod.modFilename] !== false)
            : value === 'yes';
          ++this.nextState.counter;
        },
      },
    };
  }

  public componentWillReceiveProps(newProps: IProps) {
    if (this.props.importStep !== newProps.importStep) {
      if (newProps.importStep === 'start') {
        this.start();
      } else if (newProps.importStep === 'setup') {
        this.setup();
      } else if (newProps.importStep === 'working') {
        this.startImport();
      }
    }
  }

  public render(): JSX.Element {
    const { t, importStep } = this.props;
    const { error, sources } = this.state;

    const canCancel = ['start', 'setup'].indexOf(importStep) !== -1;
    const nextLabel = ((sources !== undefined) && (sources.length > 0))
      ? this.nextLabel(importStep)
      : undefined;

    return (
      <Modal id='import-dialog' show={importStep !== undefined} onHide={this.nop}>
        <Modal.Header>
          <Modal.Title>{t('Nexus Mod Manager (NMM) Import Tool')}</Modal.Title>
          {this.renderCurrentStep()}
        </Modal.Header>
        <Modal.Body style={{ height: '60vh', display: 'flex', flexDirection: 'column' }}>
          {error !== undefined ? <Alert>{error}</Alert> : this.renderContent(importStep)}
        </Modal.Body>
        <Modal.Footer>
          {canCancel ? <Button onClick={this.cancel}>{t('Cancel')}</Button> : null}
          { nextLabel ? (
            <Button disabled={this.isNextDisabled()} onClick={this.next}>{nextLabel}</Button>
           ) : null }
        </Modal.Footer>
      </Modal>
    );
  }

  private isNextDisabled = () => {
    const { importStep } = this.props;
    const { error, modsToImport } = this.state;
    return (error !== undefined)
        || ((importStep === 'setup') && (modsToImport === undefined));
  }

  private renderCurrentStep(): JSX.Element {
    const { t, importStep } = this.props;

    return (
      <Steps step={importStep} style={{ marginBottom: 32 }}>
        <Steps.Step
          key='start'
          stepId='start'
          title={t('Start')}
          description={t('Introduction')}
        />
        <Steps.Step
          key='setup'
          stepId='setup'
          title={t('Setup')}
          description={t('Select Mods to import')}
        />
        <Steps.Step
          key='working'
          stepId='working'
          title={t('Import')}
          description={t('Magic happens')}
        />
        <Steps.Step
          key='review'
          stepId='review'
          title={t('Review')}
          description={t('Import result')}
        />
      </Steps>
    );
  }

  private renderContent(state: Step): JSX.Element {
    switch (state) {
      case 'start': return this.renderStart();
      case 'setup': return this.renderSelectMods();
      case 'working': return this.renderWorking();
      case 'review': return this.renderReview();
      default: return null;
    }
  }

  private renderStart(): JSX.Element {
    const { t } = this.props;
    const { sources, selectedSource } = this.state;

    return (
      <span
        style={{
          display: 'flex', flexDirection: 'column',
          justifyContent: 'space-around', height: '100%',
        }}
      >
        {t('This tool is an easy way of transferring your current '
          + 'NMM configuration into Vortex.')}
        <div>
          {t('Before you continue, please take note of a few things:')}
          <ul>
            <li>{t('Mods will be copied from NMM to Vortex. This may take a while.')}</li>
            <li>{t('Your original NMM installation is not modified.')}</li>
            <li>{t('Please make sure you have enough disk space to copy the selected mods.')}</li>
            <li>{t('A new profile is created inside Vortex.')}</li>
          </ul>
        </div>
        {sources === undefined
          ? <Spinner />
          : sources.length === 0
            ? this.renderNoSources()
            : this.renderSources(sources, selectedSource)
        }
      </span>
    );
  }

  private renderNoSources(): JSX.Element {
    const { t } = this.props;

    return (
      <span className='import-errors'>
        <Icon name='feedback-error' />
        {' '}
        {t('No NMM install found with mods for this game. ' +
          'Please note that only NMM >= 0.63 is supported.')}
      </span>
    );
  }

  private renderSources(sources: string[][], selectedSource: string[]): JSX.Element {
    const { t } = this.props;

    return (
      <div>
        {t('If you have multiple instances of NMM installed you can select which one '
          + 'to import here:')}
        <SplitButton
          id='import-select-source'
          title={selectedSource[0] || ''}
          onSelect={this.selectSource}
          style={{ marginLeft: 15 }}
        >
          {sources.map(this.renderSource)}
        </SplitButton>
      </div>
    );
  }

  private renderSource = option => {
    return <MenuItem key={option} eventKey={option}>{option[0]}</MenuItem>;
  }

  private toggleArchiveImport = () => {
    const {importArchives} = this.state;

    this.nextState.importArchives = !importArchives;
  }

  private renderSelectMods(): JSX.Element {
    const { t } = this.props;
    const { counter, importArchives, modsToImport } = this.state;

    const content = (modsToImport === undefined)
      ? (
        <div
          style={{ flex: '1 1 0', display: 'flex',
                   justifyContent: 'center', alignItems: 'center' }}
        >
            <Icon style={{ width: '5em', height: '5em' }} name='spinner' />
        </div>
      ) : (
        <Table
          tableId='mods-to-import'
          data={modsToImport}
          dataId={counter}
          actions={[]}
          staticElements={[
            this.mStatus, MOD_ID, MOD_NAME, MOD_VERSION, FILENAME, FILES, LOCAL]}
        />
      );

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {content}
        <Toggle
          checked={importArchives}
          onToggle={this.toggleArchiveImport}
          style={{ marginTop: 10 }}
        >
          <a
            className='fake-link'
            title={t('Imports only the archives referenced by imported mods')}
          >
            {t('Import archives')}
          </a>
        </Toggle>
      </div>
    );
  }

  private renderWorking(): JSX.Element {
    const { t } = this.props;
    const { progress, modsToImport } = this.state;
    if (progress === undefined) {
      return null;
    }
    const perc = Math.floor((progress.pos * 100) / Object.keys(modsToImport).length);
    return (
      <div className='import-working-container'>
        <span>{t('Currently importing: {{mod}}', {replace: { mod: progress.mod }})}</span>
        <ProgressBar now={perc} label={`${perc}%`} />
      </div>
    );
  }

  private renderReview(): JSX.Element {
    const { t } = this.props;
    const { failedImports } = this.state;

    return (
      <div className='import-working-container'>
        {
          failedImports.length === 0
            ? (
              <span className='import-success'>
                <Icon name='feedback-success' /> {t('Import successful')}
              </span>
            ) : (
              <span className='import-errors'>
                <Icon name='feedback-error' /> {t('There were errors')}
              </span>
            )
        }
        <span className='import-review-text'>
          {t('You can review the log at')}
          {' '}
          <a onClick={this.openLog}>{this.mTrace.logFilePath}</a>
        </span>
      </div>
    );
  }

  private openLog = (evt) => {
    evt.preventDefault();
    opn(this.mTrace.logFilePath).catch(err => undefined);
  }

  private nextLabel(step: Step): string {
    const {t} = this.props;
    switch (step) {
      case 'start': return t('Setup');
      case 'setup': return t('Start Import');
      case 'working': return null;
      case 'review': return t('Finish');
    }
  }

  private selectSource = eventKey => {
    this.nextState.selectedSource = eventKey;
  }

  private nop = () => undefined;

  private cancel = () => {
    this.props.onSetStep(undefined);
  }

  private next = (): void => {
    const { onSetStep, importStep } = this.props;
    const currentIdx = ImportDialog.STEPS.indexOf(importStep);
    onSetStep(ImportDialog.STEPS[currentIdx + 1]);
  }

  private start() {
    this.nextState.error = undefined;
    findInstances(this.props.gameId)
      .then(found => {
        this.nextState.sources = found;
        this.nextState.selectedSource = found[0];
      })
      .catch(err => {
        this.nextState.error = err.message;
      });
  }

  private setup() {
    const { gameId } = this.props;
    const virtualPath =
      path.join(this.state.selectedSource[0], 'VirtualInstall', 'VirtualModConfig.xml');
    const state: types.IState = this.context.api.store.getState();
    const mods = state.persistent.mods[gameId] || {};

    parseNMMConfigFile(virtualPath, mods)
      .then((modEntries: IModEntry[]) => {
        this.nextState.modsToImport = modEntries.reduce((prev, value) => {
          // modfilename appears to be the only field that we can rely on being set and it being
          // unique
          prev[value.modFilename] = value;
          return prev;
        }, {});
      })
      .catch(err => {
        this.nextState.error = err.message;
      });
  }

  private isModEnabled(mod: IModEntry): boolean {
    return ((this.state.importEnabled[mod.modFilename] !== false) &&
          !((this.state.importEnabled[mod.modFilename] === undefined) && mod.isAlreadyManaged));
  }

  private startImport() {
    const { gameId, t } = this.props;
    const { importArchives, modsToImport, selectedSource } = this.state;

    this.mTrace = new TraceImport();

    const modList = Object.keys(modsToImport).map(id => modsToImport[id]);
    const enabledMods = modList.filter(mod => this.isModEnabled(mod));
    const virtualInstallPath = path.join(selectedSource[0], 'VirtualInstall');
    const nmmLinkPath = (selectedSource[1]) ? path.join(selectedSource[1], gameId, 'NMMLink') : '';
    const modsPath = selectedSource[2];

    this.mTrace.initDirectory(selectedSource[0])
      .then(() => {
        this.mTrace.log('info', 'NMM Mods (count): ' + modList.length +
          ' - Importing (count):' + enabledMods.length);
        importMods(this.context.api, this.mTrace,
        virtualInstallPath, nmmLinkPath, modsPath, enabledMods,
        importArchives, (mod: string, pos: number) => {
          this.nextState.progress = { mod, pos };
        })
        .then(errors => {
          this.nextState.failedImports = errors;
          this.props.onSetStep('review');
        });
      })
      .catch(err => {
        this.nextState.error = err.message;
      });
  }
}

function mapStateToProps(state: any): IConnectedProps {
  return {
    gameId: selectors.activeGameId(state),
    importStep: state.session.modimport.importStep,
  };
}

function mapDispatchToProps(dispatch: Redux.Dispatch<any>): IActionProps {
  return {
    onSetStep: (step?: Step) => dispatch(setImportStep(step)),
  };
}

export default translate([ 'common' ], { wait: false })(
  connect(mapStateToProps, mapDispatchToProps)(
    ImportDialog)) as React.ComponentClass<{}>;
