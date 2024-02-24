export const BiconomyAccountRecoveryAbi = [
  {
    inputs: [
      {
        internalType: 'bytes32[]',
        name: 'guardians',
        type: 'bytes32[]',
      },
      {
        components: [
          {
            internalType: 'uint48',
            name: 'validUntil',
            type: 'uint48',
          },
          {
            internalType: 'uint48',
            name: 'validAfter',
            type: 'uint48',
          },
        ],
        internalType: 'struct IAccountRecoveryModule.TimeFrame[]',
        name: 'timeFrames',
        type: 'tuple[]',
      },
      {
        internalType: 'uint8',
        name: 'recoveryThreshold',
        type: 'uint8',
      },
      {
        internalType: 'uint24',
        name: 'securityDelay',
        type: 'uint24',
      },
      {
        internalType: 'uint8',
        name: 'recoveriesAllowed',
        type: 'uint8',
      },
    ],
    name: 'initForSmartAccount',
    outputs: [
      {
        internalType: 'address',
        name: '',
        type: 'address',
      },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;
