#!/usr/bin/env node

import { spawn } from 'child_process';
import { env } from 'process';
import { stdin, stdout } from 'process';
import net from 'net';
import dgram from 'dgram';

const localhost = '127.0.0.1';
const writePort = env['SCLANG_LSP_CLIENTPORT'] || '57210';
const readPort = env['SCLANG_LSP_SERVERPORT'] || '57211';

// FIXME: remove after debug
let sclangPath = '/Applications/SuperCollider.app/Contents/MacOS/sclang';

function printUsage()
{
  console.log(
`
sclang-lsp-stdio [-h] [sclang_path]

Example usage:
sclang-lsp-stdio /path/to/sclang
`
  );
}

const args = process.argv.slice(2);
if (args.length > 0) {
  if (args[0] === '-h') {
    printUsage();
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

function createProcess()
{
  return new Promise((resolve, reject) => {
    const opts = processOptions();
    const proc = spawn(opts.command, opts.args, opts.options);

    if (!proc) {
      reject(new Error('Could not start sclang process'));
    }

    proc.stdout.on('data', (data) => {
      const str = data.toString();
      console.log(str);
      if (str.indexOf('***LSP READY***') != -1) {
        resolve(proc);
      }
    });

    proc.on('error', (err) => {
      reject(new Error(err.stack));
    });

    proc.on('close', (code) => {
      console.log('process exited with: ', code);
    });
  })
}

function createServer()
{
  return new Promise((resolve, reject) => {
    const server = dgram.createSocket('udp4');

    server.on('error', (err) => {
      server.close();
      reject(new Error(err.stack));
    });

    server.on('message', (data) => {
      const response = data.toString();
      stdout.write(response);
    });

    server.bind(readPort, localhost, () => {
      const address = server.address();
      console.log(`UDP server listening on ${address.port}`);
      resolve(server);
    });
  });
}

function createClient()
{
  return new Promise((resolve, reject) => {
    const client = net.createConnection(writePort, localhost, () => {
      console.log(`TCP client connected to ${writePort}`);
      resolve(client);
    });

    client.on('error', (err) => {
      reject(new Error(err.stack));
    });
  });
}

try {
  await createProcess();
  await createServer();
  const client = await createClient();
  stdin.on('data', (data) => {
    const request = data.toString();
    client.write(request);
  });
} catch (e) {
  console.error(e);
}
