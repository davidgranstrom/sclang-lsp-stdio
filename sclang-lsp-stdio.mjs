#!/usr/bin/env node

import { spawn } from 'child_process';
import { env } from 'process';
import { stdin, stdout } from 'process';
import dgram from 'dgram';
import fs from 'fs';

const localhost = '127.0.0.1';
const writePort = env['SCLANG_LSP_CLIENTPORT'] || '57210';
const readPort = env['SCLANG_LSP_SERVERPORT'] || '57211';

let sclangPath;
let logger = {write: () => {}};

function printUsage()
{
  console.log(
`
sclang-lsp-stdio [sclang_path] [-hd]

Example usage:
sclang-lsp-stdio /path/to/sclang
sclang-lsp-stdio /path/to/sclang -d /tmp/log.txt
`
  );
}

const args = process.argv.slice(2);
if (args.length == 0) {
    printUsage();
    process.exit(0);
} else {
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '-h':
        printUsage();
        process.exit(0);
        break;
      case '-d':
        const outputPath = args[i + 1];
        if (outputPath === null) {
          console.error('No file path for debugger');
          process.exit(-1);
        }
        logger = fs.createWriteStream(outputPath);
        i++;
        break;
      default:
        sclangPath = args[i];
        break;
    }
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
      logger.write(str);
      if (str.indexOf('***LSP READY***') != -1) {
        resolve(proc);
      }
    });

    proc.on('error', (err) => {
      reject(new Error(err.stack));
    });

    proc.on('close', (code) => {
      logger.write(`process exited with: ${code}\n`);
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
      logger.write(`UDP server listening on ${address.port}\n`);
      resolve(server);
    });
  });
}

function createClient()
{
  return dgram.createSocket('udp4');
}

try {
  await createProcess();
  await createServer();
  const client = await createClient();
  stdin.on('data', (data) => {
    const request = data.toString();
    logger.write(request + '\n');
    client.send(request, writePort, localhost);
  });
} catch (e) {
  console.error(e);
}
