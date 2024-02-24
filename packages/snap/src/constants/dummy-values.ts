import { PaymasterMode } from '@biconomy-devx/account';
import { stripHexPrefix } from '@ethereumjs/util';
import { ethers } from 'ethers';

export const DUMMY_SIGNATURE =
  '0xfffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c';

/**
 * Get the dummy paymaster and data.
 *
 * @param paymasterAddress - The address of the paymaster.
 * @param paymasterMode
 * @returns The dummy paymaster and data.
 */
export function getDummyPaymasterAndData(
  paymasterMode?: PaymasterMode,
): string {
  if (paymasterMode === PaymasterMode.ERC20) {
    return '0x00000f7365ca6c59a2c93719ad53d567ed49c14c010000000000000000000000000000000000000000000000000000000065d84c650000000000000000000000000000000000000000000000000000000065d8455d000000000000000000000000da5289fcaaf71d52a80a254da614a192b693e97700000000000000000000000000000f7748595e46527413574a9327942e744e9100000000000000000000000000000000000000000000000000000000000f1cad00000000000000000000000000000000000000000000000000000000001053b0b392cdfaa75db4946e2a25f2826e66ac6f7486540c569de1e6cd6a51e1cf07cd1a96990127338121339b0b7496617dcadfd61f33e32e8312feb15e8f9c5fa3ef1c';
  } else if (paymasterMode === PaymasterMode.SPONSORED) {
    return '0x00000f79b7faf42eebadba19acc07cd08af447890000000000000000000000002cf491602ad22944d9047282abc00d3e52f56b370000000000000000000000000000000000000000000000000000000065d9e0c70000000000000000000000000000000000000000000000000000000065d9d9bf00000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000041499879d1b2e3c56764ccaa679868bb52cc684b83e8b85fe981ca90e2fbe344504470e3affb5d9fcffd4dc43474c3dd0b0feaed60dbc68d4e1e7c3595782d90eb1b00000000000000000000000000000000000000000000000000000000000000';
  }
  return '0x';
}

export const DUMMY_GAS_VALUES = {
  callGasLimit: '0x58a83',
  verificationGasLimit: '0xe8c4',
  preVerificationGas: '0xc57c',
};
