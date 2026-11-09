import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import qs from 'qs';

// Run the parser in a child: an uncaught decoder error must fail this test,
// not terminate the test runner. These are the public server's parser options.
for (const parser of ['json', 'raw']) {
  test(`${parser} parser survives trailing bytes after a compressed request`, async () => {
    const source = `
      import express from 'express';
      import http from 'node:http';
      import {gzipSync} from 'node:zlib';
      import assert from 'node:assert/strict';
      const app = express();
      app.use(express.${parser}(${parser === 'json' ? "{limit:'2mb'}" : "{type:'application/json'}"}));
      app.post('/', (req,res) => res.json({ok:true}));
      app.get('/health', (req,res) => res.end('alive'));
      const server = app.listen(0, '127.0.0.1');
      await new Promise(resolve => server.once('listening', resolve));
      const port = server.address().port;
      try {
        const body = Buffer.concat([gzipSync('{"a":1}'), Buffer.from([0]), Buffer.alloc(100*1024, 0x58)]);
        await new Promise((resolve,reject) => {
          const req = http.request({host:'127.0.0.1',port,method:'POST',path:'/',headers:{'Content-Type':'application/json','Content-Encoding':'gzip','Content-Length':body.length}}, res => {
            res.resume(); res.once('end',resolve);
          });
          req.once('error',reject); req.end(body);
        });
        await new Promise(resolve => setTimeout(resolve,200));
        const health = await fetch('http://127.0.0.1:'+port+'/health');
        assert.equal(await health.text(),'alive');
        const valid = await fetch('http://127.0.0.1:'+port+'/',{method:'POST',headers:{'Content-Type':'application/json','Content-Encoding':'gzip'},body:gzipSync('{"a":1}')});
        assert.equal(valid.status,200);
      } finally { server.closeAllConnections(); server.close(); }
    `;
    await promisify(execFile)(process.execPath, ['--input-type=module', '-e', source], {
      cwd: new URL('..', import.meta.url), timeout: 10000,
    });
  });
}

test('qs comma serialization tolerates an untrusted own toString property', () => {
  for (const encodeValuesOnly of [false, true]) {
    assert.doesNotThrow(() => qs.stringify({a:[{toString:'x'}]}, {arrayFormat:'comma',encodeValuesOnly}));
  }
  assert.equal(qs.stringify({a:['one','two']},{arrayFormat:'comma'}),'a=one%2Ctwo');
});
