import {
  MethodNotSupportedError,
  handleKeyringRequest,
} from '@metamask/keyring-api';
import {
  panel,
  type OnKeyringRequestHandler,
  type OnRpcRequestHandler,
  heading,
  divider,
  text,
  DialogType,
} from '@metamask/snaps-sdk';

import { BiconomyKeyring } from './biconomyKeyring';
import type { ChainConfig } from './keyring';
import { logger } from './logger';
import { InternalMethod, originPermissions } from './permissions';
import { getState } from './stateManagement';

let keyring: BiconomyKeyring;

/**
 * Return the keyring instance. If it doesn't exist, create it.
 */
async function getKeyring(): Promise<BiconomyKeyring> {
  if (!keyring) {
    const state = await getState();
    if (!keyring) {
      keyring = new BiconomyKeyring(state);
    }
  }
  return keyring;
}

export const promptUser = async (
  prompt: string,
  description: string,
  content: string,
): Promise<boolean> => {
  const response: any = await snap.request({
    method: 'snap_dialog',
    params: {
      type: DialogType.Confirmation,
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

/**
 * Verify if the caller can call the requested method.
 *
 * @param origin - Caller origin.
 * @param method - Method being called.
 * @returns True if the caller is allowed to call the method, false otherwise.
 */
function hasPermission(origin: string, method: string): boolean {
  return originPermissions.get(origin)?.includes(method) ?? false;
}

/**
 *
 */
async function getEntropy() {
  return snap.request({
    method: 'snap_getEntropy',
    params: {
      version: 1,
      salt: 'bicoaasnap04',
    },
  });
}

export const onRpcRequest: OnRpcRequestHandler = async ({
  origin,
  request,
}) => {
  logger.debug(
    `RPC request (origin="${origin}"):`,
    JSON.stringify(request, undefined, 2),
  );

  // Check if origin is allowed to call method.
  if (!hasPermission(origin, request.method)) {
    throw new Error(
      `Origin '${origin}' is not allowed to call '${request.method}'`,
    );
  }

  // Handle custom methods.
  switch (request.method) {
    case InternalMethod.SetConfig: {
      if (!request.params?.length) {
        throw new Error('Missing config');
      }
      return (await getKeyring()).setConfig(request.params as ChainConfig);
    }

    case 'genPk':
      {
        // https://docs.metamask.io/snaps/reference/rpc-api/#snap_dialog
        const entropy = await getEntropy();
        console.log('entropy', entropy);
      }
      break;

    default: {
      throw new MethodNotSupportedError(request.method);
    }
  }
};

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore TODO: fix types
export const onKeyringRequest: OnKeyringRequestHandler = async ({
  origin,
  request,
}) => {
  logger.info(
    `Keyring request (origin="${origin}"):`,
    JSON.stringify(request, undefined, 2),
  );

  // Check if origin is allowed to call method.
  if (!hasPermission(origin, request.method)) {
    throw new Error(
      `Origin '${origin}' is not allowed to call '${request.method}'`,
    );
  }

  // Handle keyring methods.
  return handleKeyringRequest(await getKeyring(), request);
};
