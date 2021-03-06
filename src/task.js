const Debug = require('debug');
const { Buffer } = require('buffer');
const {
  checkEvent,
  bnifyNestedEthersBn,
  cleanRPC,
  NULL_BYTES32,
  sleep,
  FETCH_INTERVAL,
} = require('./utils');
const { bytes32Schema, uint256Schema, throwIfMissing } = require('./validator');
const { ObjectNotFoundError } = require('./errors');
const { wrapCall, wrapSend, wrapWait } = require('./errorWrappers');

const debug = Debug('iexec:task');
const objName = 'task';

const TASK_STATUS_MAP = {
  0: 'UNSET',
  1: 'ACTIVE',
  2: 'REVEALING',
  3: 'COMPLETED',
  4: 'FAILED',
  timeout: 'TIMEOUT',
};

const show = async (
  contracts = throwIfMissing(),
  taskid = throwIfMissing(),
) => {
  try {
    const vTaskId = await bytes32Schema().validate(taskid);
    const { chainId } = contracts;
    const hubContract = contracts.getHubContract();
    const task = bnifyNestedEthersBn(
      cleanRPC(await wrapCall(hubContract.viewTask(vTaskId))),
    );
    if (task.dealid === NULL_BYTES32) {
      throw new ObjectNotFoundError('task', vTaskId, chainId);
    }

    const now = Math.floor(Date.now() / 1000);
    const consensusTimeout = parseInt(task.finalDeadline, 10);
    const taskTimedOut = task.status !== 3 && now >= consensusTimeout;

    const decodedResult = task.results
      && Buffer.from(task.results.substr(2), 'hex').toString('utf8');
    const displayResult = decodedResult
      && (decodedResult.substr(0, 6) === '/ipfs/'
        || decodedResult.substr(0, 4) === 'http')
      ? decodedResult
      : task.results;
    return {
      taskid: vTaskId,
      ...task,
      statusName:
        task.status < 3 && taskTimedOut
          ? TASK_STATUS_MAP.timeout
          : TASK_STATUS_MAP[task.status],
      taskTimedOut,
      results: displayResult,
    };
  } catch (error) {
    debug('show()', error);
    throw error;
  }
};

const waitForTaskStatusChange = async (
  contracts = throwIfMissing(),
  taskid = throwIfMissing(),
  prevStatus = throwIfMissing(),
) => {
  try {
    const vTaskId = await bytes32Schema().validate(taskid);
    const vPrevStatus = await uint256Schema().validate(prevStatus);
    const task = await show(contracts, vTaskId);
    if (task.status.toString() !== vPrevStatus || task.taskTimedOut) {
      return task;
    }
    await sleep(FETCH_INTERVAL);
    return waitForTaskStatusChange(contracts, vTaskId, task.status);
  } catch (error) {
    debug('waitForTaskStatusChange()', error);
    throw error;
  }
};

const claim = async (
  contracts = throwIfMissing(),
  taskid = throwIfMissing(),
) => {
  try {
    const vTaskId = await bytes32Schema().validate(taskid);
    const task = await show(contracts, vTaskId);
    const taskStatus = task.status;

    if ([3, 4].includes(taskStatus)) {
      throw Error(
        `Cannot claim a ${objName} having status ${
          TASK_STATUS_MAP[taskStatus.toString()]
        }`,
      );
    }

    if (!task.taskTimedOut) {
      throw Error(
        `Cannot claim a ${objName} before reaching the consensus deadline date: ${new Date(
          1000 * parseInt(task.finalDeadline, 10),
        )}`,
      );
    }

    const hubContract = contracts.getHubContract();
    const claimTx = await wrapSend(
      hubContract.claim(taskid, contracts.txOptions),
    );

    const claimTxReceipt = await wrapWait(claimTx.wait());
    if (!checkEvent('TaskClaimed', claimTxReceipt.events)) throw Error('TaskClaimed not confirmed');

    return claimTx.hash;
  } catch (error) {
    debug('claim()', error);
    throw error;
  }
};

module.exports = {
  TASK_STATUS_MAP,
  show,
  waitForTaskStatusChange,
  claim,
};
