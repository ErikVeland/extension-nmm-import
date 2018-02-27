import { transferArchive, transferUnpackedMod} from '../util/modFileImport';

import {IModEntry} from '../types/nmmEntries';
import TraceImport from './TraceImport';
import { addMods, createProfile } from './vortexImports';

import * as Promise from 'bluebird';
import * as path from 'path';
import { generate as shortid } from 'shortid';
import { actions, fs, selectors, types } from 'vortex-api';

function getInner(ele: Element): string {
  if ((ele !== undefined) && (ele !== null)) {
    const node = ele.childNodes[0];
    if (node !== undefined) {
      return node.nodeValue;
    }
  }
  return undefined;
}

function enhance(sourcePath: string, input: IModEntry): Promise<IModEntry> {
  // this id is currently identically to what we store as the vortexId but I don't want
  // to rely on that always being the case
  const id = path.basename(input.modFilename, path.extname(input.modFilename));
  const cacheBasePath = path.resolve(sourcePath, 'cache', id);
  return fs.readFileAsync(path.join(cacheBasePath, 'cacheInfo.txt'))
    .then(data => {
      const fields = data.toString().split('@@');
      return fs.readFileAsync(path.join(cacheBasePath,
        (fields[1] === '-') ? '' : fields[1], 'fomod', 'info.xml'));
    })
    .then(infoXmlData => {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(infoXmlData.toString(), 'text/xml');
      const category = getInner(xmlDoc.querySelector('fomod CustomCategoryId'))
                    || getInner(xmlDoc.querySelector('fomod CategoryId'));

      const categoryId = category !== undefined
        ? parseInt(category, 10)
        : undefined;

      return {
        ...input,
        archiveId: shortid(),
        categoryId,
      };
    })
    .catch(err => input);
}

function importMods(api: types.IExtensionApi,
                    trace: TraceImport,
                    sourcePath: string,
                    alternateSourcePath: string,
                    modsPath: string,
                    mods: IModEntry[],
                    transferArchives: boolean,
                    progress: (mod: string, idx: number) => void): Promise<string[]> {
  const store = api.store;
  const state = store.getState();

  const gameId = selectors.activeGameId(state);

  const errors: string[] = [];

  return trace.writeFile('parsedMods.json', JSON.stringify(mods))
    .then(() => {
      trace.log('info', 'transfer unpacked mods files');
      const installPath = selectors.installPath(state);
      const downloadPath = selectors.downloadPath(state);
      return Promise.map(mods, mod => enhance(modsPath, mod))
        .then(modsEx => Promise.mapSeries(modsEx, (mod, idx) => {
          trace.log('info', 'transferring', mod);
          progress(mod.modName, idx);
          return transferUnpackedMod(mod, sourcePath, alternateSourcePath, installPath, true)
            .then(failed => {
              if (failed.length > 0) {
                trace.log('error', 'Failed to import', failed);
                errors.push(mod.modName);
              }
              if (transferArchives) {
                const archivePath = path.join(mod.archivePath, mod.modFilename);
                return fs.statAsync(archivePath)
                  .then(stats => {
                    store.dispatch(actions.addLocalDownload(
                      mod.archiveId, gameId, mod.modFilename, stats.size));
                    return transferArchive(archivePath, downloadPath);
                  })
                  .then(failedArchive => {
                    if (failedArchive !== null) {
                      trace.log('error', 'Failed to import mod archive', failedArchive);
                      errors.push(mod.modFilename);
                    }
                  });
              }
            });
        })
          .then(() => {
            trace.log('info', 'Finished transferring unpacked mod files');
            const profileId = shortid();
            createProfile(gameId, profileId, 'Imported NMM Profile', api.store.dispatch);
            addMods(gameId, profileId, modsEx, api.store.dispatch);
          }));
    })
    .then(() => {
      trace.finish();
      return errors;
    });
}

export default importMods;
