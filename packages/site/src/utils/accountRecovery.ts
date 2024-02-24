import { ethers } from 'ethers';

const controlMessage = 'ACC_RECOVERY_SECURE_MSG';

// // eslint-disable-next-line jsdoc/require-description, jsdoc/require-returns
// /**
//  * Convert a Uint8Array to a hex string
//  * @param uint8Array - The Uint8Array to convert
//  */
// function uint8ArrayToHex(uint8Array: Uint8Array) {
//   return Array.from(uint8Array)
//     .map((byte) => byte.toString(16).padStart(2, '0'))
//     .join('');
// }

export const makeHashToGetGuardianId = async (
  smartAccount: string,
): Promise<string> => {
  const messageHash = ethers.utils.solidityKeccak256(
    ['string', 'address'],
    [controlMessage, smartAccount],
  );
  console.log('messageHash ', messageHash);
  return messageHash;
};

export const getMessageToSignByGuardian = async (
  smartAccount: string,
): Promise<string> => {
  return await makeHashToGetGuardianId(smartAccount);
};
