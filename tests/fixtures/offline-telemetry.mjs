import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';
import { EventEmitter } from 'node:events';
import { writeFileSync } from 'node:fs';

https.request = () => {
  const request = new EventEmitter();
  request.destroy = () => {};
  request.end = bytes => {
    writeFileSync(process.env.STARTER_TEST_LOG, bytes);
    queueMicrotask(() => request.emit('error', new Error('offline test transport')));
  };
  return request;
};
syncBuiltinESMExports();
