import fs from 'node:fs';import path from 'node:path';
export function prepareCrmStorage({dataDir,requiredMount}){
 if(!dataDir)throw new Error('CRM requires persistent DATA_DIR');
 const dir=fs.realpathSync(dataDir),mount=fs.realpathSync(requiredMount||dataDir);
 if(dir!==mount&&!dir.startsWith(mount+path.sep))throw new Error('CRM data is outside the persistent disk');
 const file=path.join(dir,'store.json'),backupPath=path.join(dir,'crm-pre-integration-2026-10-07.backup.json');
 const content=fs.readFileSync(file,'utf8');JSON.parse(content);
 try{fs.copyFileSync(file,backupPath,fs.constants.COPYFILE_EXCL);fs.chmodSync(backupPath,0o600)}catch(error){if(error.code!=='EEXIST')throw error;JSON.parse(fs.readFileSync(backupPath,'utf8'))}
 return {backupPath,persistent:true};
}
