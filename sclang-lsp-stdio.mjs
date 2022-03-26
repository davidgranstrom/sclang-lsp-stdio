#!/usr/bin/env node

import { spawn } from 'child_process';
import { env } from 'process';
import { stdin, stdout } from 'process';
import net from 'net';

const localhost = '127.0.0.1';
const writePort = env['SCLANG_LSP_CLIENTPORT'] || '57210';
const readPort = env['SCLANG_LSP_SERVERPORT'] || '57211';
// FIXME: remove after debug
let sclangPath = '/Applications/SuperCollider.app/Contents/MacOS/sclang';

const args = process.argv.slice(2);

if (args.length > 0) {
  if (args[0] == '-h') {
    console.log('sclang-lsp-stdio [-h] [sclang_path]');
    console.log('\nexample usage:');
    console.log('sclang-lsp-stdio /path/to/sclang');
    process.exit(0);
  } else {
    sclangPath = args[0];
  }
}

function processOptions()
{
  env['SCLANG_LSP_ENABLE'] = '1';
  env['SCLANG_LSP_CLIENTPORT'] = writePort;
  env['SCLANG_LSP_SERVERPORT'] = readPort;

  return {
    command: sclangPath,
    args: ['-i', 'vscode'],
    options: {
      stdio: 'pipe',
      windowsHide: true,
    }
  }
}

async function createProcess()
{
  return new Promise((resolve, reject) => {
    const opts = processOptions();
    const proc = spawn(opts.command, opts.args, opts.options);

    if (!proc) {
      reject('Could not start sclang process');
    }

    proc.stdout.on('data', (data) => {
      const str = data.toString();
      console.log(str);
      if (str.indexOf('***LSP READY***') != -1) {
        resolve(proc);
      }
    });

    proc.on('close', (code) => {
      console.log('process exited with: ', code);
    });
  })
}

const sclang = await createProcess();

const server = net.createServer((connection) => {
  console.log('sclang LSP connected');

  connection.on('data', (data) => {
    if (data) {
      const response = data.toString();
      // console.log(response);
      stdout.write(response);
    }
  });

  connection.on('end', () => {
    console.log('sclang LSP disconnected');
  });
});

server.listen(readPort, localhost, () => {
  console.log('TCP server listening on', readPort);
});

const client = net.createConnection(writePort, localhost, () => {
  console.log('TCP client connected to', writePort);
});

client.on('error', (err) => {
  console.error('TCP client error', err);
});

stdin.on('data', (data) => {
  if (data) {
    const request = data.toString();
    // console.log(request);
    client.write(request);
  }
});
