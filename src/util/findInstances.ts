import * as Promise from 'bluebird';
import { remote } from 'electron';
import * as path from 'path';
import { fs } from 'vortex-api';

function convertGameId(input: string): string {
  if (input === 'skyrimse') {
    return 'SkyrimSE';
  } else if (input === 'falloutnv') {
    return 'FalloutNV';
  }
  return input.replace(/(?:^|\s)\S/g, (a) => a.toUpperCase());
}

function getVirtualFolder(userConfig: string, gameId: string): string[] {
  const parser = new DOMParser();

  const xmlDoc = parser.parseFromString(userConfig, 'text/xml');

  let item = xmlDoc
    .querySelector(`setting[name="VirtualFolder"] item[modeId="${convertGameId(gameId)}" i] string`);

  if (item === null) {
    return undefined;
  }

  const virtualPath = item.textContent;
  let nmmLinkPath = '';

  item = xmlDoc
  .querySelector(`setting[name="HDLinkFolder"] item[modeId="${convertGameId(gameId)}" i] string`);

  if (item !== null) {
    nmmLinkPath = item.textContent;
  }

  item = xmlDoc
  .querySelector(`setting[name="ModFolder"] item[modeId="${convertGameId(gameId)}" i] string`);

  if (item === null) {
    return undefined;
  }

  const modsPath = item.textContent;

  const setting = [ virtualPath, nmmLinkPath, modsPath ];
  return setting;
}

function findInstances(gameId: string): Promise<string[][]> {
  const base = path.resolve(remote.app.getPath('appData'), '..', 'local', 'Black_Tree_Gaming');
  return fs.readdirAsync(base)
    .filter((fileName: string) => fs.statAsync(path.join(base, fileName))
                                      .then(stat => stat.isDirectory()))
    .then((instances: string[]) =>
      Promise.map(instances, instance => fs.readdirAsync(path.join(base, instance))
        .then((versions: string[]) =>
          Promise.map(versions, version =>
            fs.readFileAsync(path.join(base, instance, version, 'user.config'))
              .then((data: NodeBuffer) =>
                getVirtualFolder(data.toString(), gameId))))))
    .then(result => {
      // remove duplicates, in a case-insensitive way, remove undefined
      const set = result.reduce((prev: { [key: string]: string[] }, value: string[][]) => {
        value.forEach(val => {
          if (val !== undefined) {
            prev[val[0].toUpperCase()] = val;
          }
        });
        return prev;
      }, {});
      return Object.keys(set).map(key => set[key]);
    })
    .catch(err => (err.code === 'ENOENT') ? Promise.resolve([]) : Promise.reject(err));
}

export default findInstances;
