import { IModEntry } from './types/nmmEntries';

import type { TFunction } from 'i18next';
import * as React from 'react';
import { TableTextFilter, tooltip, types } from 'vortex-api';

export const MOD_ID: types.ITableAttribute = {
  id: 'id',
  name: 'Mod Id',
  description: 'Nexus id of the mod',
  icon: 'id-badge',
  calc: (mod: IModEntry) => mod.nexusId,
  placement: 'both',
  isToggleable: true,
  isSortable: true,
  isDefaultVisible: false,
  edit: {},
};

export const MOD_NAME: types.ITableAttribute = {
  id: 'name',
  name: 'Mod Name',
  description: 'The Name of the mod',
  icon: 'quote-left',
  calc: (mod: IModEntry) => mod.modName,
  placement: 'both',
  isToggleable: true,
  isSortable: true,
  filter: new TableTextFilter(true),
  edit: {},
  sortFunc: (lhs: string, rhs: string, locale: string): number => {
    return lhs.localeCompare(rhs, locale, { sensitivity: 'base' });
  },
};

export const MOD_VERSION: types.ITableAttribute = {
  id: 'version',
  name: 'Mod Version',
  description: 'The mod version',
  icon: 'map-marker',
  calc: (mod: IModEntry) => mod.modVersion,
  placement: 'both',
  isToggleable: true,
  isSortable: true,
  filter: new TableTextFilter(false),
  sortFunc: (lhs: string, rhs: string, locale: string): number => {
    return lhs.localeCompare(rhs, locale, { sensitivity: 'base' });
  },
  edit: {},
};

export const FILENAME: types.ITableAttribute = {
  id: 'filename',
  name: 'Mod Archive',
  description: 'The filename of the mod archive',
  icon: 'file-picture-o',
  calc: (mod: IModEntry) => mod.modFilename,
  placement: 'both',
  isToggleable: true,
  isSortable: true,
  isDefaultVisible: false,
  filter: new TableTextFilter(true),
  edit: {},
};

export const LOCAL: types.ITableAttribute<IModEntry> = {
  id: 'local',
  name: 'Duplicate',
  description: 'Whether the mod/archive is already managed by Vortex',
  icon: 'level-up',
  customRenderer: (mod: IModEntry, detail: boolean, t: TFunction) => {
    return mod.isAlreadyManaged ? (
      <tooltip.Icon
        id={`import-duplicate-${mod.nexusId}`}
        tooltip={t('This archive is already managed by Vortex')}
        name='feedback-warning'
      />
   ) : null;
  },
  calc: mod => mod.isAlreadyManaged,
  placement: 'table',
  isToggleable: true,
  isSortable: true,
  filter: new TableTextFilter(true),
  edit: {},
};
