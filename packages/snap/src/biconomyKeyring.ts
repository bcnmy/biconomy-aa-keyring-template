/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable camelcase */
import type { UserOpStatus } from '@biconomy-devx/account';
import { PaymasterMode } from '@biconomy-devx/account';
import {
  addHexPrefix,
  Address,
  isValidPrivate,
  // stripHexPrefix,
  toChecksumAddress,
} from '@ethereumjs/util';
import type {
  EthBaseTransaction,
  EthBaseUserOperation,
  EthUserOperation,
  EthUserOperationPatch,
  Keyring,
  KeyringAccount,
  KeyringRequest,
  SubmitRequestResponse,
} from '@metamask/keyring-api';
import {
  emitSnapKeyringEvent,
  EthAccountType,
  EthMethod,
} from '@metamask/keyring-api';
import { KeyringEvent } from '@metamask/keyring-api/dist/events';
import {
  panel,
  type Json,
  type JsonRpcRequest,
  heading,
  divider,
  text,
} from '@metamask/snaps-sdk';
import { hexToBytes } from '@metamask/utils';
import { Buffer } from 'buffer';
import { ethers, HDNodeWallet, Mnemonic } from 'ethers';
import { v4 as uuid } from 'uuid';
import type { Hex } from 'viem';
import { encodeAbiParameters, parseAbiParameters } from 'viem';

import { DEFAULT_AA_FACTORIES } from './constants/aa-factories';
import {
  ACCOUNT_RECOVERY_MODULE_ADDRESS,
  ECDSA_MODULE_ADDRESS,
} from './constants/biconomy-addresses';
import { CHAIN_IDS } from './constants/chain-ids';
import {
  DUMMY_SIGNATURE,
  getDummyPaymasterAndData,
} from './constants/dummy-values';
import { DEFAULT_ENTRYPOINTS } from './constants/entrypoints';
import { USDC_ADDRESS_MUMBAI } from './constants/tokenConfig';
import { logger } from './logger';
import { InternalMethod } from './permissions';
import { saveState } from './stateManagement';
import {
  EntryPoint__factory,
  // SimpleAccount__factory,
  SimpleAccountFactory__factory,
  // VerifyingPaymaster__factory,
} from './types';
import { BiconomyAccountRecoveryAbi } from './utils/abi/BiconomyAccountRecoveryAbi';
import { BiconomyImplementationAbi } from './utils/abi/BiconomyImplementationAbi';
import { getBiconomySmartAccount } from './utils/biconomyAccount';
import { getBundlerUrl } from './utils/chainConfig';
import { getUserOperationHash } from './utils/ecdsa';
import { getSigner, provider } from './utils/ethers';
import {
  isEvmChain,
  isUniqueAddress,
  runSensitive,
  throwError,
} from './utils/util';

const unsupportedAAMethods = [
  EthMethod.SignTransaction,
  EthMethod.Sign,
  EthMethod.PersonalSign,
  EthMethod.SignTypedDataV1,
  EthMethod.SignTypedDataV3,
  EthMethod.SignTypedDataV4,
];

export type UserOperationStruct = {
  /* the origin of the request */
  sender: string;
  /* nonce of the transaction, returned from the entrypoint for this Address */
  nonce: number | bigint | `0x${string}`;
  /* the initCode for creating the sender if it does not exist yet, otherwise "0x" */
  initCode: Uint8Array | Hex | '0x';
  /* the callData passed to the target */
  callData: Uint8Array | Hex;
  /* Value used by inner account execution */
  callGasLimit?: number | bigint | `0x${string}`;
  /* Actual gas used by the validation of this UserOperation */
  verificationGasLimit?: number | bigint | `0x${string}`;
  /* Gas overhead of this UserOperation */
  preVerificationGas?: number | bigint | `0x${string}`;
  /* Maximum fee per gas (similar to EIP-1559 max_fee_per_gas) */
  maxFeePerGas?: number | bigint | `0x${string}`;
  /* Maximum priority fee per gas (similar to EIP-1559 max_priority_fee_per_gas) */
  maxPriorityFeePerGas?: number | bigint | `0x${string}`;
  /* Address of paymaster sponsoring the transaction, followed by extra data to send to the paymaster ("0x" for self-sponsored transaction) */
  paymasterAndData: Uint8Array | Hex | '0x';
  /* Data passed into the account along with the nonce during the verification step */
  signature: Uint8Array | Hex;
};

export type ChainConfig = {
  simpleAccountFactory?: string;
  entryPoint?: string;
  bundlerUrl?: string;
  customVerifyingPaymasterPK?: string;
  customVerifyingPaymasterAddress?: string;
};

// export type AccountRecoverySettings = {
//   guardianId: string;
//   accountAddress: string;
//   validUntil: number;
//   securityDelay: number;
//   numRecoveries: number;
// };

export type KeyringState = {
  wallets: Record<string, Wallet>;
  pendingRequests: Record<string, KeyringRequest>;
  config: Record<number, ChainConfig>;
};

// export type TransactionDetails = {
//   userOpHash: string;
// };

export type TransactionResponse = {
  userOpHash: string;
  transactionHash: string;
};

// Can have array of objects also (to, value, data) as technically batching is now possible from companion dapp!
export type TransactionPayload = {
  accountAddress: string;
  to: string;
  value: string;
  data: string;
};

export type Wallet = {
  account: KeyringAccount;
  admin: string;
  privateKey: string;
  chains: Record<string, boolean>;
  salt: string;
  initCode: string;
};

export const promptUser = async (
  prompt: string,
  description: string,
  content: string,
): Promise<boolean> => {
  const response: any = await snap.request({
    method: 'snap_dialog',
    params: {
      type: 'confirmation',
      content: panel([
        heading('Transaction request'),
        divider(),
        text(`**${prompt}**`),
        text(`${description}`),
        text(`${content}`),
      ]),
    },
  });
  console.log('Prompt user response', response);
  if (response) {
    return response;
  }
  return false;
};

// This we should be able to source symbol or address from what's being set under gas settings on companion Dapp
// Note: could be a mapping per chainId

// Applies only for Mumbai
// Todo: Get based on chainId
const PREFERRED_FEE_TOKEN_ADDRESS =
  '0xdA5289fCAAF71d52a80A254da614a192b693e977';

export class BiconomyKeyring implements Keyring {
  #state: KeyringState;

  constructor(state: KeyringState) {
    this.#state = state;
  }

  // ideas for custom methods
  // setAccountRecoveryExpermiental
  // sending custom transaction[] with useropDispatcher
  // issue session key

  async sendTransaction(
    transactionDetails: TransactionPayload,
  ): Promise<TransactionResponse> {
    console.log('sendTransaction called ', transactionDetails);

    const wallet = this.#getWalletByAddress(transactionDetails.accountAddress);

    if (!wallet) {
      throwError(
        `[Snap] Account '${transactionDetails.accountAddress}' not found`,
      );
    }

    const { chainId } = await provider.getNetwork();

    const smartAccount = await getBiconomySmartAccount(
      Number(chainId),
      wallet.privateKey as Hex,
    );

    const userop = await smartAccount.buildUserOp([
      {
        to: transactionDetails.to,
        data: transactionDetails.data,
        value: transactionDetails.value,
      },
    ]);

    console.log('userop', userop);

    const useropWithPnd = await smartAccount.getPaymasterUserOp(userop, {
      mode: PaymasterMode.ERC20,
      preferredToken: USDC_ADDRESS_MUMBAI,
    });

    const signer = getSigner(wallet.privateKey);

    const entryPoint = await this.#getEntryPoint(Number(chainId), signer);

    const userOpHash = getUserOperationHash(
      useropWithPnd as any,
      await entryPoint.getAddress(),
      chainId.toString(10),
    );

    const approval = await promptUser(
      'user operation confirmation',
      'do you want to sign this userOp? you will pay with USDC in your account',
      userOpHash, // JSON.stringify(useropWithPnd),
    );

    if (approval) {
      const userOpWithsignature = await smartAccount.signUserOp(useropWithPnd);
      console.log('signature', userOpWithsignature.signature);

      const userOpResponse = await smartAccount.sendUserOp(useropWithPnd);

      const transactionDetails1: UserOpStatus =
        await userOpResponse.waitForTxHash();
      const txHash = transactionDetails1.transactionHash;
      console.log('transachion hash', txHash);

      if (txHash) {
        await snap.request({
          method: 'snap_dialog',
          params: {
            type: 'confirmation',
            content: panel([
              heading('Transaction sent'),
              divider(),
              text(`Transaction hash :`),
              // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
              text(`**${txHash}**`),
            ]),
          },
        });
      }
      return {
        userOpHash: userOpResponse.userOpHash ?? '',
        transactionHash: txHash ?? '',
      };
    }
    throw new Error('UserOp not signed');
  }

  // called by setAccountRecoveryExperimental
  /* async setAccountRecovery(
    accountRecoverySettings: AccountRecoverySettings,
  ): Promise<TransactionDetails> {
    const wallet = this.#getWalletByAddress(
      accountRecoverySettings.accountAddress,
    );

    if (!wallet) {
      throwError(
        `[Snap] Account '${accountRecoverySettings.accountAddress}' not found`,
      );
    }

    const { chainId } = await provider.getNetwork();

    const smartAccount = await getBiconomySmartAccount(
      Number(chainId),
      wallet.privateKey as Hex,
    );

    const { validUntil } = accountRecoverySettings;
    console.log('validUntil ', validUntil);

    const accountRecoverySetupData = encodeFunctionData({
      abi: BiconomyAccountRecoveryAbi,
      functionName: 'initForSmartAccount',
      args: [
        [accountRecoverySettings.guardianId as Hex],
        [
          {
            validUntil,
            validAfter: 0,
          },
        ],
        1,
        accountRecoverySettings.securityDelay,
        accountRecoverySettings.numRecoveries,
      ],
    });

    console.log('accountRecoverySetupData ', accountRecoverySetupData);

    const setupAndEnableModuleData = encodeFunctionData({
      abi: BiconomyImplementationAbi,
      functionName: 'setupAndEnableModule',
      args: [ACCOUNT_RECOVERY_MODULE_ADDRESS, accountRecoverySetupData],
    });

    console.log('setupAndEnableModuleData ', setupAndEnableModuleData);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const { waitForTxHash } = await smartAccount.sendTransaction(
      {
        to: await smartAccount.getAccountAddress(),
        value: '0x0',
        data: setupAndEnableModuleData,
      },
      { paymasterServiceData: { mode: PaymasterMode.SPONSORED } },
    );
    const { transactionHash } = await waitForTxHash();
    console.log('transactionHash ', transactionHash);
    if (transactionHash) {
      await snap.request({
        method: 'snap_dialog',
        params: {
          type: 'confirmation',
          content: panel([
            heading('Transaction sent'),
            divider(),
            text(`Transaction hash :`),
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            text(`**${transactionHash}**`),
          ]),
        },
      });
    }
    return {
      userOpHash: transactionHash ?? '',
    };
  }*/

  async setConfig(config: ChainConfig): Promise<ChainConfig> {
    const { chainId } = await provider.getNetwork();
    if (
      config.simpleAccountFactory &&
      !ethers.isAddress(config.simpleAccountFactory)
    ) {
      throwError(
        `[Snap] Invalid Simple Account Factory Address: ${
          config.simpleAccountFactory as string
        }`,
      );
    }
    if (config.entryPoint && !ethers.isAddress(config.entryPoint)) {
      throwError(
        `[Snap] Invalid EntryPoint Address: ${config.entryPoint as string}`,
      );
    }
    if (
      config.customVerifyingPaymasterAddress &&
      !ethers.isAddress(config.customVerifyingPaymasterAddress)
    ) {
      throwError(
        `[Snap] Invalid Verifying Paymaster Address: ${
          config.customVerifyingPaymasterAddress as string
        }`,
      );
    }
    const bundlerUrlRegex =
      /^(https?:\/\/)?[\w\\.-]+(:\d{2,6})?(\/[\\/\w \\.-]*)?$/u;
    if (config.bundlerUrl && !bundlerUrlRegex.test(config.bundlerUrl)) {
      throwError(`[Snap] Invalid Bundler URL: ${config.bundlerUrl}`);
    }
    if (config.customVerifyingPaymasterPK) {
      try {
        // eslint-disable-next-line no-new -- doing this to validate the pk
        new ethers.Wallet(config.customVerifyingPaymasterPK);
      } catch (error) {
        throwError(
          `[Snap] Invalid Verifying Paymaster Private Key: ${
            (error as Error).message
          }`,
        );
      }
    }
    this.#state.config[Number(chainId)] = {
      ...this.#state.config[Number(chainId)],
      ...config,
    };

    await this.#saveState();
    return this.#state.config[Number(chainId)]!;
  }

  async listAccounts(): Promise<KeyringAccount[]> {
    return Object.values(this.#state.wallets).map((wallet) => wallet.account);
  }

  async getEntropy(): Promise<string> {
    return snap.request({
      method: 'snap_getEntropy',
      params: {
        version: 1,
        salt: 'bicoaasnap02',
      },
    });
  }

  async getAccount(id: string): Promise<KeyringAccount> {
    return (
      this.#state.wallets[id]?.account ??
      throwError(`Account '${id}' not found`)
    );
  }

  async createAccount(
    options: Record<string, Json> = {},
  ): Promise<KeyringAccount> {
    // Input private key from the user should not be necessary to create an account
    /* if (!options.privateKey) {
      throwError(`[Snap] Private Key is required`);
    }*/

    const size = Object.values(this.#state.wallets).length;

    // If we go with ECDSA module or SA V1 then this is our EOA owner of the SA
    const path = `m/44'/60'/0'/0/${size}`;
    const entropy = await this.getEntropy();

    const { privateKey, address: admin } = this.#getKeyPair(
      entropy,
      path,
      options?.privateKey as string | undefined,
    );

    console.log('[KEYRING] EOA address', admin);

    if (!isUniqueAddress(admin, Object.values(this.#state.wallets))) {
      throw new Error(`Account address already in use: ${admin}`);
    }
    // The private key should not be stored in the account options since the
    // account object is exposed to external components, such as MetaMask and
    // the snap UI.
    if (options?.privateKey) {
      delete options.privateKey;
    }

    const random = ethers.toBigInt(ethers.randomBytes(32));

    const salt =
      (options.salt as string) ??
      ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [random]);

    const { chainId } = await provider.getNetwork();

    const smartAccount = await getBiconomySmartAccount(
      Number(chainId),
      privateKey as Hex,
    );

    const aaAddress = await smartAccount.getAccountAddress();

    // check on chain if the account already exists.
    // if it does, this means that there is a collision in the salt used.
    const accountCollision = (await provider.getCode(aaAddress)) !== '0x';
    if (accountCollision) {
      throwError(`[Snap] Account Salt already used, please retry.`);
    }

    // Note: this is commented out because the AA is not deployed yet.
    // Will store the initCode and salt in the wallet object to deploy with first transaction later.
    // try {
    //   await aaFactory.createAccount(admin, salt);
    //   logger.info('[Snap] Deployed AA Account Successfully');
    // } catch (error) {
    //   logger.error(`Error to deploy AA: ${(error as Error).message}`);
    // }

    try {
      const account: KeyringAccount = {
        id: uuid(),
        options,
        address: aaAddress,
        methods: [
          // 4337 methods
          EthMethod.PrepareUserOperation,
          EthMethod.PatchUserOperation,
          EthMethod.SignUserOperation,
        ],
        type: EthAccountType.Erc4337,
      };
      this.#state.wallets[account.id] = {
        account,
        admin, // Address of the admin account from private key
        privateKey,
        chains: { [chainId.toString()]: false },
        salt,
        initCode: '0x',
      };
      await this.#emitEvent(KeyringEvent.AccountCreated, { account });
      await this.#saveState();
      console.log('[SNAP] Account created', account.address);
      return account;
    } catch (error) {
      throw new Error((error as Error).message);
    }
  }

  async filterAccountChains(_id: string, chains: string[]): Promise<string[]> {
    // The `id` argument is not used because all accounts created by this snap
    // are expected to be compatible with any EVM chain.
    return chains.filter((chain) => isEvmChain(chain));
  }

  async updateAccount(account: KeyringAccount): Promise<void> {
    const wallet =
      this.#state.wallets[account.id] ??
      throwError(`Account '${account.id}' not found`);

    if (
      unsupportedAAMethods.some((method) => account.methods.includes(method))
    ) {
      throwError(`[Snap] Account does not implement EIP-1271`);
    }

    const newAccount: KeyringAccount = {
      ...wallet.account,
      ...account,
      // Restore read-only properties.
      address: wallet.account.address,
    };

    try {
      await this.#emitEvent(KeyringEvent.AccountUpdated, {
        account: newAccount,
      });
      wallet.account = newAccount;
      await this.#saveState();
    } catch (error) {
      throwError((error as Error).message);
    }
  }

  async deleteAccount(id: string): Promise<void> {
    try {
      await this.#emitEvent(KeyringEvent.AccountDeleted, { id });
      delete this.#state.wallets[id];
      await this.#saveState();
    } catch (error) {
      throwError((error as Error).message);
    }
  }

  async listRequests(): Promise<KeyringRequest[]> {
    return Object.values(this.#state.pendingRequests);
  }

  async getRequest(id: string): Promise<KeyringRequest> {
    return (
      this.#state.pendingRequests[id] ?? throwError(`Request '${id}' not found`)
    );
  }

  async submitRequest(request: KeyringRequest): Promise<SubmitRequestResponse> {
    return this.#syncSubmitRequest(request);
  }

  async approveRequest(id: string): Promise<void> {
    const { account, request } =
      this.#state.pendingRequests[id] ??
      throwError(`Request '${id}' not found`);

    const result = await this.#handleSigningRequest({
      account: this.#getWalletById(account).account,
      method: request.method,
      params: request.params ?? [],
    });

    await this.#removePendingRequest(id);
    await this.#emitEvent(KeyringEvent.RequestApproved, { id, result });
  }

  async rejectRequest(id: string): Promise<void> {
    if (this.#state.pendingRequests[id] === undefined) {
      throw new Error(`Request '${id}' not found`);
    }

    await this.#removePendingRequest(id);
    await this.#emitEvent(KeyringEvent.RequestRejected, { id });
  }

  async #removePendingRequest(id: string): Promise<void> {
    delete this.#state.pendingRequests[id];
    await this.#saveState();
  }

  async #syncSubmitRequest(
    request: KeyringRequest,
  ): Promise<SubmitRequestResponse> {
    const { method, params = [] } = request.request as JsonRpcRequest;

    if (method === InternalMethod.SetConfig) {
      return {
        pending: false,
        result: await this.setConfig((params as [ChainConfig])[0]),
      };
    }

    // Expermiental // Test
    // if (method === 'snap.account.setRecovery') {
    //   return {
    //     pending: false,
    //     result: await this.setAccountRecovery(
    //       (params as [AccountRecoverySettings])[0],
    //     ),
    //   };
    // }

    if (method === 'snap.account.sendTransaction') {
      return {
        pending: false,
        result: await this.sendTransaction((params as [TransactionPayload])[0]),
      };
    }

    const signature = await this.#handleSigningRequest({
      account: this.#getWalletById(request.account).account,
      method,
      params,
    });
    return {
      pending: false,
      result: signature,
    };
  }

  #getWalletById(accountId: string): Wallet {
    const wallet = this.#state.wallets[accountId];
    if (!wallet) {
      throwError(`Account '${accountId}' not found`);
    }
    return wallet;
  }

  #getWalletByAddress(address: string): Wallet {
    const match = Object.values(this.#state.wallets).find(
      (wallet) =>
        wallet.account.address.toLowerCase() === address.toLowerCase(),
    );

    return match ?? throwError(`Account '${address}' not found`);
  }

  // TODO:
  // can be several approaches to derive private key
  // 1. generate random private key
  // 2. derive from private key of first metamask eoa account
  // 3. generate entropy
  // 4.

  #getKeyPair(
    entropy: string,
    path: string,
    privateKey?: string,
  ): {
    privateKey: string;
    address: string;
  } {
    if (privateKey) {
      const privateKeyBuffer: Buffer = runSensitive(
        () => Buffer.from(hexToBytes(addHexPrefix(privateKey))),
        'Invalid private key',
      );

      if (!isValidPrivate(privateKeyBuffer)) {
        throw new Error('Invalid private key');
      }

      const address = toChecksumAddress(
        Address.fromPrivateKey(privateKeyBuffer).toString(),
      );
      return { privateKey: privateKeyBuffer.toString('hex'), address };
    }

    const mnemonic = Mnemonic.fromEntropy(entropy);
    const childWallet = HDNodeWallet.fromMnemonic(mnemonic, path);

    return {
      privateKey: childWallet.privateKey.toString(),
      address: childWallet.address,
    };
  }

  async #handleSigningRequest({
    account,
    method,
    params,
  }: {
    account: KeyringAccount;
    method: string;
    params: Json;
  }): Promise<Json> {
    const { chainId } = await provider.getNetwork();
    if (!this.#isSupportedChain(Number(chainId))) {
      throwError(`[Snap] Unsupported chain ID: ${Number(chainId)}`);
    }

    switch (method) {
      case EthMethod.PrepareUserOperation: {
        const transactions = params as EthBaseTransaction[];
        return await this.#prepareUserOperation(account.address, transactions);
      }

      case EthMethod.PatchUserOperation: {
        const [userOp] = params as [EthUserOperation];
        return await this.#patchUserOperation(account.address, userOp);
      }

      case EthMethod.SignUserOperation: {
        const [userOp] = params as [EthUserOperation];
        return await this.#signUserOperation(account.address, userOp);
      }

      default: {
        throw new Error(`EVM method '${method}' not supported`);
      }
    }
  }

  async #prepareUserOperation(
    address: string,
    transactions: EthBaseTransaction[],
  ): Promise<EthBaseUserOperation> {
    if (transactions.length !== 1) {
      throwError(`[Snap] Only one transaction per UserOp supported`);
    }
    const transaction =
      transactions[0] ?? throwError(`[Snap] Transaction is required`);
    logger.info(
      `[Snap] PrepareUserOp for transaction\n: ${JSON.stringify(
        transaction,
        null,
        2,
      )}`,
    );

    const wallet = this.#getWalletByAddress(address);

    const { chainId } = await provider.getNetwork();

    const smartAccount = await getBiconomySmartAccount(
      Number(chainId),
      wallet.privateKey as Hex,
    );

    const biconomyBaseUserOp = await smartAccount.buildUserOp([
      {
        to: transaction.to ?? ethers.ZeroAddress,
        value: transaction.value ?? '0x0',
        data: transaction.data ?? ethers.ZeroHash,
      },
      // paymasterServiceData
    ]);

    console.log('biconomyBaseUserOp ', biconomyBaseUserOp);

    // TODO: things to discuss
    // 1. We do already have gas limits as this point
    // 2. paymasterAndData can be patched at this point for the verifying paymaster
    // 3. dummyPaymasterAndData is perhpas not necessary and can be sent 0x for using biconomy paymaster

    const bundlerUrl = getBundlerUrl(Number(chainId));
    if (bundlerUrl === '' || bundlerUrl === undefined) {
      throw new Error('Bundler URL not found');
    }

    const ethBaseUserOp: EthBaseUserOperation = {
      nonce: biconomyBaseUserOp?.nonce?.toString() ?? '0x00',
      initCode: biconomyBaseUserOp?.initCode?.toString() ?? '0x',
      callData: biconomyBaseUserOp?.callData?.toString() ?? '0x',
      dummySignature:
        biconomyBaseUserOp?.signature?.toString() ?? DUMMY_SIGNATURE,
      dummyPaymasterAndData: getDummyPaymasterAndData(PaymasterMode.ERC20), // sufficient for SPONSORED as well
      bundlerUrl,
      // Can pass on gas limits
      /* gasLimits: {
        callGasLimit: biconomyBaseUserOp?.callGasLimit?.toString() ?? '0x0',
        verificationGasLimit:
          biconomyBaseUserOp?.verificationGasLimit?.toString() ?? '0x0',
        preVerificationGas:
          biconomyBaseUserOp?.preVerificationGas?.toString() ?? '0x0',
      },*/
    };

    console.log('ethBaseUserOp ', ethBaseUserOp);
    return ethBaseUserOp;
  }

  async #patchUserOperation(
    address: string,
    userOp: EthUserOperation,
  ): Promise<EthUserOperationPatch> {
    console.log('patch userop called here ');
    console.log('userOp coming from upstream ', userOp);
    const wallet = this.#getWalletByAddress(address);

    const { chainId } = await provider.getNetwork();

    const smartAccount = await getBiconomySmartAccount(
      Number(chainId),
      wallet.privateKey as Hex,
    );

    console.log(
      'smartAccount address ',
      await smartAccount.getAccountAddress(),
    );

    // Note: types conversion needed from EthUserOperation to Partial<UserOperationStruct>
    const biconomyBaseUserOp: Partial<UserOperationStruct> = {
      sender: userOp.sender as Hex,
      nonce: userOp.nonce as number | bigint | `0x${string}`,
      initCode: userOp.initCode as Hex,
      callData: userOp.callData as Hex,
      callGasLimit: userOp.callGasLimit as Hex,
      verificationGasLimit: userOp.verificationGasLimit as Hex,
      preVerificationGas: userOp.preVerificationGas as Hex,
      maxFeePerGas: userOp.maxFeePerGas as Hex,
      maxPriorityFeePerGas: userOp.maxPriorityFeePerGas as Hex,
      paymasterAndData: '0x',
      signature: userOp.signature as Hex,
    };

    // Review: second call to patch userOp is sending maxFee values 0x0

    // TODO: get preferred token from set config
    try {
      console.log(
        'biconomyBaseUserOp ',
        biconomyBaseUserOp,
        Number(biconomyBaseUserOp.nonce),
      );

      // Get paymasterAndData directly if feeTokenAddress is known and it's approval is given

      let useropWithPnd;

      if (Number(biconomyBaseUserOp.nonce) <= 2) {
        useropWithPnd = await smartAccount.getPaymasterAndData(
          biconomyBaseUserOp,
          {
            mode: PaymasterMode.SPONSORED,
            calculateGasLimits: false,
          },
        );
      } else {
        useropWithPnd = await smartAccount.getPaymasterUserOp(
          biconomyBaseUserOp,
          {
            mode: PaymasterMode.ERC20,
            calculateGasLimits: false,
            // Note: how can this come from some settings
            preferredToken: PREFERRED_FEE_TOKEN_ADDRESS, // Mumbai USDC (get from config)
            skipPatchCallData: true,
          },
        );
      }

      console.log('useropWithPnd ', useropWithPnd);

      return {
        paymasterAndData: useropWithPnd?.paymasterAndData?.toString() ?? '0x',
      };
    } catch (error) {
      return {
        paymasterAndData: '0x',
      };
    }

    // TODO: discuss
    // Note: return type is currently fine. but patchUserOperation may return full userop struct with updated gas limits from paymaster
  }

  async #signUserOperation(
    address: string,
    userOp: EthUserOperation,
  ): Promise<string> {
    const wallet = this.#getWalletByAddress(address);
    const signer = getSigner(wallet.privateKey);

    const { chainId } = await provider.getNetwork();

    // skip usage of Biconomy sdk
    // Note: don't see any harm in this and creating a signature compatible with Biconomy Smart Account V2 (appending ecdsa module address)
    const entryPoint = await this.#getEntryPoint(Number(chainId), signer);
    logger.info(
      `[Snap] SignUserOperation:\n${JSON.stringify(userOp, null, 2)}`,
    );

    // Sign the userOp
    userOp.signature = '0x';
    const userOpHash = getUserOperationHash(
      userOp,
      await entryPoint.getAddress(),
      chainId.toString(10),
    );

    const signature = await signer.signMessage(ethers.getBytes(userOpHash));

    const finalSignature = encodeAbiParameters(
      parseAbiParameters('bytes, address'),
      [signature as Hex, ECDSA_MODULE_ADDRESS],
    );

    return finalSignature;
  }

  // Review: (possibly) Marked for Deletion
  async #getAAFactory(chainId: number, signer: ethers.Wallet) {
    if (!this.#isSupportedChain(chainId)) {
      throwError(`[Snap] Unsupported chain ID: ${chainId}`);
    }
    let factoryAddress: string;
    const chainConfig = this.#getChainConfig(chainId);
    if (chainConfig?.simpleAccountFactory) {
      factoryAddress = chainConfig.simpleAccountFactory;
    } else {
      const entryPointVersion =
        DEFAULT_ENTRYPOINTS[chainId]?.version.toString() ??
        throwError(`[Snap] Unknown EntryPoint for chain ${chainId}`);
      factoryAddress =
        (DEFAULT_AA_FACTORIES[entryPointVersion] as Record<string, string>)?.[
          chainId.toString()
        ] ??
        throwError(
          `[Snap] Unknown AA Factory address for chain ${chainId} and EntryPoint version ${entryPointVersion}`,
        );
    }
    return SimpleAccountFactory__factory.connect(factoryAddress, signer);
  }

  async #getEntryPoint(chainId: number, signer: ethers.Wallet) {
    if (!this.#isSupportedChain(chainId)) {
      throwError(`[Snap] Unsupported chain ID: ${chainId}`);
    }
    const entryPointAddress =
      this.#getChainConfig(chainId)?.entryPoint ??
      DEFAULT_ENTRYPOINTS[chainId]?.address ??
      throwError(`[Snap] Unknown EntryPoint for chain ${chainId}`);

    return EntryPoint__factory.connect(entryPointAddress, signer);
  }

  #getChainConfig(chainId: number): ChainConfig | undefined {
    return this.#state.config?.[chainId];
  }

  #isSupportedChain(chainId: number): boolean {
    return (
      Object.values(CHAIN_IDS).includes(chainId) ||
      Boolean(this.#state.config[chainId])
    );
  }

  async #saveState(): Promise<void> {
    await saveState(this.#state);
  }

  async #emitEvent(
    event: KeyringEvent,
    data: Record<string, Json>,
  ): Promise<void> {
    await emitSnapKeyringEvent(snap, event, data);
  }
}
