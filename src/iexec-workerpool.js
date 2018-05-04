#!/usr/bin/env node

const cli = require('commander');
const { help, handleError, desc } = require('./cli-helper');
const hub = require('./hub');
const { loadChain, loadIExecConf, option } = require('./loader');
const { loadAddress } = require('./keystore');

const objName = 'workerPool';

cli
  .option(...option.chain())
  .option(...option.hub())
  .option(...option.user());

cli
  .command('create')
  .description(desc.createObj(objName))
  .action(async () => {
    try {
      const [chain, iexecConf] = await Promise.all([
        loadChain(cli.chain),
        loadIExecConf(),
      ]);
      hub.createObj(objName)(cli.hub, iexecConf[objName], chain.contracts);
    } catch (error) {
      handleError(error, objName);
    }
  });

cli
  .command('show <addressOrIndex>')
  .description(desc.showObj(objName))
  .action(async (addressOrIndex) => {
    try {
      const [chain, walletAddress] = await Promise.all([
        loadChain(cli.chain),
        loadAddress(),
      ]);
      const userAddress = cli.user || walletAddress;

      hub.showObj(objName)(
        addressOrIndex,
        cli.hub,
        userAddress,
        chain.contracts,
      );
    } catch (error) {
      handleError(error, objName);
    }
  });

cli
  .command('count')
  .description(desc.countObj(objName))
  .action(async () => {
    try {
      const [chain, walletAddress] = await Promise.all([
        loadChain(cli.chain),
        loadAddress(),
      ]);
      const userAddress = cli.user || walletAddress;

      hub.countObj(objName)(cli.user, cli.hub, userAddress, chain.contracts);
    } catch (error) {
      handleError(error, objName);
    }
  });

help(cli);
